"""WhatsApp Cloud API client.

Wraps the Meta Graph API for sending messages, downloading media, and
managing message templates.

Ref: https://developers.facebook.com/docs/whatsapp/cloud-api
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)

ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
PHONE_NUMBER_ID = os.environ.get("META_PHONE_NUMBER_ID", "")
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}"

_session = requests.Session()
_session.headers.update({
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
})


def _post(endpoint: str, payload: dict) -> dict:
    """POST to the WhatsApp Cloud API and return the JSON response."""
    url = f"{BASE_URL}/{endpoint}"
    resp = _session.post(url, json=payload, timeout=10)
    if resp.status_code >= 400:
        logger.error("WhatsApp API error %s: %s", resp.status_code, resp.text[:500])
    resp.raise_for_status()
    return resp.json()


# ── Sending messages ─────────────────────────────────────────────────────────

def send_text(phone: str, text: str) -> dict:
    """Send a plain text message. Auto-splits if > 4096 chars."""
    chunks = [text[i:i + 4096] for i in range(0, len(text), 4096)]
    result = {}
    for chunk in chunks:
        result = _post("messages", {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "text",
            "text": {"body": chunk},
        })
    return result


def send_interactive_buttons(phone: str, body: str, buttons: list[dict]) -> dict:
    """Send a message with up to 3 action buttons.

    Each button: {"id": "btn_id", "title": "Button Label"}
    """
    return _post("messages", {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": body},
            "action": {
                "buttons": [
                    {"type": "reply", "reply": btn} for btn in buttons[:3]
                ],
            },
        },
    })


def send_interactive_list(phone: str, body: str, button_text: str,
                          sections: list[dict]) -> dict:
    """Send a list picker message.

    Each section: {"title": "Section", "rows": [{"id": "row_id", "title": "Row"}]}
    """
    return _post("messages", {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {"text": body},
            "action": {
                "button": button_text,
                "sections": sections,
            },
        },
    })


def send_template(phone: str, template_name: str, language: str = "en",
                   parameters: list[str] | None = None) -> dict:
    """Send a pre-approved template message (for outside 24h window)."""
    components = []
    if parameters:
        components.append({
            "type": "body",
            "parameters": [
                {"type": "text", "text": p} for p in parameters
            ],
        })
    return _post("messages", {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": components,
        },
    })


def send_reaction(phone: str, message_id: str, emoji: str) -> dict:
    """React to a message with an emoji."""
    return _post("messages", {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "reaction",
        "reaction": {
            "message_id": message_id,
            "emoji": emoji,
        },
    })


def mark_as_read(message_id: str) -> dict:
    """Mark an incoming message as read (blue checkmarks)."""
    return _post("messages", {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
    })


def download_media(media_id: str) -> bytes:
    """Download a media file from WhatsApp.

    Two-step process: first get the media URL, then download the binary.
    """
    # Step 1: get download URL
    url = f"https://graph.facebook.com/{API_VERSION}/{media_id}"
    resp = _session.get(url, timeout=10)
    resp.raise_for_status()
    media_url = resp.json()["url"]

    # Step 2: download the binary
    resp = _session.get(media_url, timeout=30)
    resp.raise_for_status()
    return resp.content
