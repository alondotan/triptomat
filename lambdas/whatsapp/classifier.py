"""Message classification for incoming WhatsApp messages.

Routes each message to the appropriate handler based on content analysis.
Supports both slash commands and natural language in Hebrew + English.
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

# ── Natural language intent patterns ────────────────────────────────────────

_INTENT_PATTERNS: list[tuple[str, re.Pattern]] = [
    # Help
    ("cmd:help", re.compile(
        r"(?i)(^/help$|what can you do|how does this work|מה אתה יודע"
        r"|עזרה|מה אפשר לעשות|איך זה עובד|help me|תעזור)"
    )),
    # Tasks - list
    ("cmd:tasks", re.compile(
        r"(?i)(^/tasks$|show\s*tasks|list\s*tasks|my\s*tasks|pending\s*tasks"
        r"|תראה\s*משימות|מה\s*המשימות|רשימת\s*משימות|משימות\s*שלי"
        r"|יש\s*משימות|מה\s*צריך\s*לעשות|מה\s*נשאר\s*לעשות)"
    )),
    # Tasks - add (must be before "done" to avoid conflicts)
    ("cmd:add_task", re.compile(
        r"(?i)(^/task\s+|תוסיף\s*משימה|הוסף\s*משימה|משימה\s*חדשה"
        r"|תזכיר\s*לי\s*(ל|ש)|תוסיף\s*ל?רשימה|add\s*task|new\s*task"
        r"|remind\s*me\s*to|צריך\s*(לזכור|לא\s*לשכוח)\s*(ל|ש))"
    )),
    # Tasks - mark done
    ("cmd:done", re.compile(
        r"(?i)(^/done\s+|סיימתי\s|עשיתי\s|ביצעתי\s|completed?\s"
        r"|finished\s|done\s*with|סימון\s*משימה|תסמן\s*(כ|ש)?)"
    )),
    # Budget
    ("cmd:budget", re.compile(
        r"(?i)(^/budget$|budget|תקציב|כמה\s*(הוצאתי|עולה|עלה|זה\s*עולה)"
        r"|מה\s*התקציב|סיכום\s*(הוצאות|תקציב|כספי)|how\s*much\s*(did|have|spent|cost)"
        r"|spending|expenses|הוצאות)"
    )),
    # Trip switch
    ("cmd:trip", re.compile(
        r"(?i)(^/trips?$|switch\s*trip|change\s*trip|select\s*trip"
        r"|תחליף\s*טיול|החלף\s*טיול|בחר\s*טיול|שנה\s*טיול|טיולים\s*שלי)"
    )),
    # Trip status
    ("cmd:status", re.compile(
        r"(?i)(^/status$|trip\s*(info|status|details|summary)"
        r"|מה\s*הטיול\s*שלי|פרטי\s*(ה)?טיול|סטטוס\s*(ה)?טיול"
        r"|איזה\s*טיול\s*(פעיל|נבחר)|מתי\s*(ה)?טיול)"
    )),
]


def classify(message: dict) -> str:
    """Classify a WhatsApp message into a routing category.

    Args:
        message: Raw message object from the WhatsApp webhook payload.

    Returns:
        One of: 'link', 'booking', 'image_booking', 'location',
                'command', 'cmd:<intent>', 'chat'
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

    # URL detection (check before intents — if there's a URL, it's a link)
    if _URL_PATTERN.search(text):
        return "link"

    # Slash commands (exact match — handled by command_handler directly)
    if text.startswith("/"):
        return "command"

    # Natural language intent matching
    for intent, pattern in _INTENT_PATTERNS:
        if pattern.search(text):
            return intent

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
