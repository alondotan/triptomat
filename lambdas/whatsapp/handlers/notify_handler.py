"""Handle outbound notifications from SQS queue.

SQS messages contain notification payloads to send to WhatsApp users.

Expected SQS message body:
{
    "phone": "972501234567",
    "type": "recommendation_ready" | "booking_confirmed" | "text",
    "text": "Message text for in-window messages",
    "template_name": "template name for out-of-window",
    "template_params": ["param1", "param2"],
    "last_message_at": "2024-01-01T00:00:00Z"  (optional, for 24h window check)
}
"""

import json
import logging
from datetime import datetime, timezone, timedelta

import meta_api

logger = logging.getLogger(__name__)

# WhatsApp allows free-form messages within 24 hours of the user's last message.
WINDOW_HOURS = 24


def handle_sqs_notifications(event: dict) -> dict:
    """Process outbound notification messages from SQS."""
    records = event.get("Records", [])
    failed = []

    for i, record in enumerate(records):
        try:
            body = json.loads(record.get("body", "{}"))
            _send_notification(body)
        except Exception as e:
            logger.error("Failed to process SQS record %d: %s", i, e)
            failed.append({"itemIdentifier": record.get("messageId")})

    # Partial batch failure reporting
    if failed:
        return {"batchItemFailures": failed}
    return {"statusCode": 200}


def _send_notification(payload: dict) -> None:
    """Send a single notification to a WhatsApp user."""
    phone = payload.get("phone", "")
    if not phone:
        logger.warning("Notification missing phone number")
        return

    msg_type = payload.get("type", "text")
    text = payload.get("text", "")
    last_message_at = payload.get("last_message_at")

    # Check if we're within the 24h messaging window
    in_window = _is_within_window(last_message_at)

    if in_window and text:
        # Within 24h window — send free-form text
        meta_api.send_text(phone, text)
    elif not in_window:
        # Outside 24h window — must use templates
        template_name = payload.get("template_name", "")
        template_params = payload.get("template_params", [])

        if template_name:
            meta_api.send_template(phone, template_name, parameters=template_params)
        else:
            logger.warning(
                "Cannot send notification to %s***%s — outside 24h window and no template",
                phone[:4], phone[-4:],
            )
    else:
        logger.warning("Notification has no text content for phone %s***%s", phone[:4], phone[-4:])


def _is_within_window(last_message_at: str | None) -> bool:
    """Check if the last user message was within the 24h messaging window."""
    if not last_message_at:
        return False  # no record of user messaging — assume out of window

    try:
        last_dt = datetime.fromisoformat(last_message_at.replace("Z", "+00:00"))
        cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
        return last_dt > cutoff
    except (ValueError, AttributeError):
        return False
