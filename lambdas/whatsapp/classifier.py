"""Message classification for incoming WhatsApp messages.

Routes each message to the appropriate handler based on content analysis.
"""

import re

# Booking-related keywords (multilingual: English + Hebrew)
_BOOKING_KEYWORDS = re.compile(
    r"(?i)(booking\s*confirm|reservation\s*confirm|order\s*confirm"
    r"|itinerary\s*receipt|e-?ticket|boarding\s*pass"
    r"|check.?in\s*date|check.?out\s*date|flight\s*number"
    r"|confirmation\s*number|reference\s*number|PNR"
    r"|אישור\s*הזמנה|מספר\s*הזמנה|כרטיס\s*טיסה"
    r"|הזמנת\s*מלון|אישור\s*טיסה)"
)

_URL_PATTERN = re.compile(r"https?://\S+")


def classify(message: dict) -> str:
    """Classify a WhatsApp message into a routing category.

    Args:
        message: Raw message object from the WhatsApp webhook payload.

    Returns:
        One of: 'link', 'booking', 'image_booking', 'location', 'command', 'chat'
    """
    msg_type = message.get("type", "text")

    # Interactive button/list replies (trip selection, linking confirmation)
    if msg_type == "interactive":
        return "command"

    # Location sharing → treat as a place to look up
    if msg_type == "location":
        return "location"

    # Images or documents → likely a booking screenshot or forwarded PDF
    if msg_type in ("image", "document"):
        return "image_booking"

    # Text messages
    text = _get_text(message)

    # Slash commands
    if text.startswith("/"):
        return "command"

    # URL detection
    if _URL_PATTERN.search(text):
        return "link"

    # Booking keywords in text (forwarded confirmation messages)
    if _BOOKING_KEYWORDS.search(text):
        return "booking"

    # Default: conversational AI chat / Q&A
    return "chat"


def _get_text(message: dict) -> str:
    """Extract plain text body from a message."""
    if message.get("type") == "text":
        return (message.get("text") or {}).get("body", "").strip()
    return ""


def extract_urls(text: str) -> list[str]:
    """Return all URLs found in a text string."""
    return _URL_PATTERN.findall(text)
