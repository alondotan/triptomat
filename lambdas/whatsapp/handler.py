"""triptomat-whatsapp Lambda handler.

Dual-trigger Lambda:
  - API Gateway: incoming WhatsApp webhook (GET verification + POST messages)
  - SQS: outbound notification messages to send via WhatsApp

Required env vars:
  META_ACCESS_TOKEN     — WhatsApp Cloud API permanent token
  META_PHONE_NUMBER_ID  — WhatsApp Business phone number ID
  META_VERIFY_TOKEN     — Webhook verification shared secret
  META_APP_SECRET       — For webhook signature verification
  SUPABASE_URL          — Supabase project URL
  SUPABASE_SERVICE_KEY  — Supabase service-role key
  GATEWAY_FUNCTION_NAME — Lambda function name for triptomat-gateway
  DYNAMODB_TABLE        — DynamoDB cache table (default: triptomat-cache)

Optional env vars:
  RATE_LIMIT            — Max messages per minute per phone (default: 30)
  OTEL_ENABLED          — "true" to enable OpenTelemetry tracing/metrics
  AI_CHAT_URL           — Full Supabase edge function URL for the shared AI brain
                          (default: https://aqpzhflzsqkjceeeufyf.supabase.co/functions/v1/ai-chat)
  AI_CHAT_TRIP_ID_SOURCE — How to resolve the trip ID for AI chat (default: active_trip_id)
"""

import hashlib
import hmac
import json
import logging
import os
import time

import boto3
from botocore.exceptions import ClientError

from classifier import classify
from handlers.link_handler import handle_link
from handlers.chat_handler import handle_chat
from handlers.command_handler import handle_command, handle_unlinked_user
from handlers.file_handler import handle_file
from handlers.notify_handler import handle_sqs_notifications
import meta_api

from core.http_utils import api_response
from core.pipeline_events import report_event
from core.telemetry import (
    init_telemetry, get_tracer, get_meter,
    safe_span, record_counter, flush_telemetry,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Telemetry setup ─────────────────────────────────────────────────────────
init_telemetry("triptomat-whatsapp")
tracer = get_tracer(__name__)
meter = get_meter(__name__)

messages_counter = meter.create_counter(
    "triptomat.whatsapp.messages_received",
    description="Total WhatsApp messages received",
)
rate_limit_counter = meter.create_counter(
    "triptomat.whatsapp.rate_limit_hits",
    description="Requests rejected by rate limiter",
)

# ── AWS clients & config ────────────────────────────────────────────────────
dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")

META_APP_SECRET = os.environ.get("META_APP_SECRET", "")
META_VERIFY_TOKEN = os.environ.get("META_VERIFY_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GATEWAY_FUNCTION_NAME = os.environ.get("GATEWAY_FUNCTION_NAME", "triptomat-gateway")
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "triptomat-cache")
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "30"))

table = dynamodb.Table(DYNAMODB_TABLE)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mask_phone(phone: str) -> str:
    """Mask phone for safe logging: +972***4567."""
    if len(phone) > 7:
        return f"{phone[:4]}***{phone[-4:]}"
    return "***"


def _response(status_code: int, body: dict) -> dict:
    """Build a plain API Gateway response (no CORS headers needed)."""
    return api_response(status_code, body)


def _verify_signature(event: dict) -> bool:
    """Verify Meta webhook signature (X-Hub-Signature-256)."""
    if not META_APP_SECRET:
        logger.warning("META_APP_SECRET not set — skipping signature verification")
        return True

    headers = event.get("headers") or {}
    signature = headers.get("X-Hub-Signature-256") or headers.get("x-hub-signature-256") or ""
    if not signature.startswith("sha256="):
        return False

    body = event.get("body", "")
    expected = hmac.new(
        META_APP_SECRET.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature[7:], expected)


def _check_rate_limit(phone: str) -> tuple[bool, int]:
    """Per-minute rate limiting via DynamoDB. Returns (within_limit, count)."""
    now = int(time.time())
    window_key = f"rate:wa:{phone}:{now // 60}"
    ttl_value = now // 60 * 60 + 120

    try:
        resp = table.update_item(
            Key={"url": window_key},
            UpdateExpression="SET #cnt = if_not_exists(#cnt, :zero) + :inc, #ttl = :ttl",
            ExpressionAttributeNames={"#cnt": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={":zero": 0, ":inc": 1, ":ttl": ttl_value},
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp["Attributes"]["count"])
        return count <= RATE_LIMIT, count
    except ClientError:
        return True, -1


def _lookup_whatsapp_user(phone: str) -> dict | None:
    """Look up a linked WhatsApp user from Supabase."""
    import urllib.request
    import urllib.error

    url = (
        f"{SUPABASE_URL}/rest/v1/whatsapp_users"
        f"?phone_number=eq.{phone}&select=*&limit=1"
    )
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            rows = json.loads(res.read().decode())
            return rows[0] if rows else None
    except Exception as e:
        logger.error("Failed to look up WhatsApp user: %s", e)
        return None


def _update_last_message(phone: str) -> None:
    """Update last_message_at for 24h window tracking."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/whatsapp_users?phone_number=eq.{phone}"
    data = json.dumps({"last_message_at": "now()"}).encode()
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning("Failed to update last_message_at: %s", e)


def _extract_message(body: dict) -> tuple[dict | None, str, str]:
    """Extract the first message, sender phone, and display name from webhook body.

    Returns (message, phone, display_name). Returns (None, '', '') if no message found.
    """
    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})

        messages = value.get("messages", [])
        if not messages:
            return None, "", ""

        message = messages[0]
        phone = message.get("from", "")

        contacts = value.get("contacts", [{}])
        display_name = contacts[0].get("profile", {}).get("name", "") if contacts else ""

        return message, phone, display_name
    except (IndexError, KeyError):
        return None, "", ""


# ── Main handler ─────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    """Dual trigger: API Gateway (webhooks) + SQS (outbound notifications)."""

    # ── SQS trigger: outbound notifications ──
    if "Records" in event:
        return handle_sqs_notifications(event)

    # Support both API Gateway v1 (httpMethod) and v2 (requestContext.http.method)
    http_method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    )

    # ── GET: Meta webhook verification ──
    if http_method == "GET":
        params = event.get("queryStringParameters") or {}
        mode = params.get("hub.mode", "")
        token = params.get("hub.verify_token", "")
        challenge = params.get("hub.challenge", "")

        if mode == "subscribe" and token == META_VERIFY_TOKEN:
            logger.info("Webhook verification successful")
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "text/plain"},
                "body": challenge,
            }
        logger.warning("Webhook verification failed: mode=%s", mode)
        return _response(403, {"error": "Verification failed"})

    # ── POST: incoming message ──
    if http_method == "POST":
        # Verify webhook signature
        if not _verify_signature(event):
            logger.warning("Invalid webhook signature")
            return _response(401, {"error": "Invalid signature"})

        body = json.loads(event.get("body") or "{}")

        # Status updates (delivered, read, etc.) — acknowledge and ignore
        statuses = (
            body.get("entry", [{}])[0]
            .get("changes", [{}])[0]
            .get("value", {})
            .get("statuses", [])
        )
        if statuses:
            return _response(200, {"status": "ok"})

        # Extract message
        message, phone, display_name = _extract_message(body)
        if not message:
            return _response(200, {"status": "ok"})

        message_id = message.get("id", "")
        masked = _mask_phone(phone)
        record_counter(messages_counter, 1, {"source": "whatsapp"})

        with safe_span(tracer, "whatsapp.handle_message", {
            "whatsapp.phone_masked": masked,
            "whatsapp.message_type": message.get("type", "unknown"),
        }):
            try:
                # Mark as read (non-blocking best-effort)
                try:
                    meta_api.mark_as_read(message_id)
                except Exception:
                    pass

                # Rate limiting
                within_limit, count = _check_rate_limit(phone)
                if not within_limit:
                    record_counter(rate_limit_counter, 1)
                    logger.warning("Rate limit exceeded for %s (count=%d)", masked, count)
                    meta_api.send_text(phone, "You're sending messages too fast. Please wait a moment.")
                    return _response(200, {"status": "rate_limited"})

                # Look up linked user
                wa_user = _lookup_whatsapp_user(phone)

                # Update last_message_at for 24h window tracking
                if wa_user:
                    _update_last_message(phone)

                # Unlinked user — start linking flow
                if not wa_user:
                    handle_unlinked_user(phone, message, display_name)
                    return _response(200, {"status": "ok"})

                # Classify and route
                msg_type = classify(message)
                msg_text = (message.get("text") or {}).get("body", "")[:100]
                logger.info(
                    "Message from %s classified as: %s | type=%s text=%r",
                    masked, msg_type, message.get("type"), msg_text,
                )

                if msg_type == "link":
                    handle_link(wa_user, message, phone)
                elif msg_type in ("command", "location") or msg_type.startswith("cmd:"):
                    handle_command(wa_user, message, phone, intent=msg_type)
                elif msg_type == "image_booking":
                    handle_file(wa_user, message, phone)
                elif msg_type == "booking":
                    meta_api.send_text(
                        phone,
                        "Booking text forwarding is coming soon! "
                        "For now, please forward bookings to your Triptomat email address.",
                    )
                elif msg_type == "chat":
                    handle_chat(wa_user, message, phone)

                return _response(200, {"status": "ok"})

            except Exception as e:
                logger.exception("Error handling message from %s: %s", masked, e)
                try:
                    meta_api.send_text(phone, "Sorry, something went wrong. Please try again.")
                except Exception:
                    pass
                return _response(200, {"status": "error"})

    # Unknown method
    return _response(405, {"error": "Method not allowed"})
