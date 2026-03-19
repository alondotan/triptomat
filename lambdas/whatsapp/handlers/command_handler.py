"""Handle commands, linking flow, and interactive responses."""

import json
import logging
import os
import random
import string

import meta_api

from core.supabase_client import get_active_trips

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


# ── Linking flow ─────────────────────────────────────────────────────────────

def handle_unlinked_user(phone: str, message: dict, display_name: str) -> None:
    """Handle a message from a phone number that isn't linked to any user."""
    text = _get_text(message)

    # Check if the message is a 6-digit linking code
    code = text.strip()
    if len(code) == 6 and code.isdigit():
        _try_link(phone, code, display_name)
        return

    # Otherwise, prompt for linking
    meta_api.send_text(
        phone,
        "Welcome to Triptomat! \U0001f30d\n\n"
        "To get started, link your account:\n"
        "1. Open the Triptomat app\n"
        "2. Go to Settings \u2192 Link WhatsApp\n"
        "3. Send me the 6-digit code\n\n"
        "Once linked, you can send me travel links, "
        "ask about your trip, and receive updates!",
    )


def _try_link(phone: str, code: str, display_name: str) -> None:
    """Validate a linking code and create the whatsapp_users entry."""
    import urllib.request
    import urllib.error

    # Call Supabase RPC to validate and link
    url = f"{SUPABASE_URL}/rest/v1/rpc/link_whatsapp"
    data = json.dumps({
        "p_code": code,
        "p_phone": phone,
        "p_display_name": display_name or None,
    }).encode()

    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            result = json.loads(res.read().decode())
    except Exception as e:
        logger.error("Failed to call link_whatsapp RPC: %s", e)
        meta_api.send_text(phone, "Something went wrong. Please try again.")
        return

    if not result.get("success"):
        error = result.get("error", "Unknown error")
        if "expired" in error.lower() or "invalid" in error.lower():
            meta_api.send_text(
                phone,
                "That code is invalid or expired. "
                "Please generate a new one from the Triptomat app.",
            )
        else:
            meta_api.send_text(phone, f"Linking failed: {error}")
        return

    user_id = result.get("user_id", "")

    # Successfully linked — now offer trip selection
    meta_api.send_text(
        phone,
        "Account linked successfully! \u2705\n\n"
        "You can now:\n"
        "\u2022 Send me links to analyze (YouTube, websites, Google Maps)\n"
        "\u2022 Ask questions about your trip\n"
        "\u2022 Type /help for all commands",
    )

    # If user has multiple trips, prompt selection
    _offer_trip_selection(phone, user_id)


def _offer_trip_selection(phone: str, user_id: str) -> None:
    """If the user has multiple active trips, send a trip selector."""
    trips = get_active_trips(user_id, SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if not trips:
        meta_api.send_text(
            phone,
            "You don't have any active trips yet. "
            "Create one in the Triptomat app first!",
        )
        return

    if len(trips) == 1:
        # Auto-select the only trip
        _set_active_trip(phone, trips[0]["id"], trips[0].get("name", "your trip"))
        return

    # Multiple trips — send interactive list
    rows = []
    for trip in trips[:10]:
        name = trip.get("name", "Unnamed trip")
        countries = ", ".join(trip.get("countries") or [])
        description = countries if countries else f"{trip.get('start_date', '')} - {trip.get('end_date', '')}"
        rows.append({
            "id": f"trip:{trip['id']}",
            "title": name[:24],
            "description": description[:72],
        })

    meta_api.send_interactive_list(
        phone,
        "Which trip would you like to use with WhatsApp?",
        "Select Trip",
        [{"title": "Your Trips", "rows": rows}],
    )


def _set_active_trip(phone: str, trip_id: str, trip_name: str) -> None:
    """Set the active trip for a WhatsApp user."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/whatsapp_users?phone_number=eq.{phone}"
    data = json.dumps({"active_trip_id": trip_id}).encode()
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        urllib.request.urlopen(req, timeout=5)
        meta_api.send_text(phone, f"Active trip set to: *{trip_name}* \u2708\ufe0f")
    except Exception as e:
        logger.error("Failed to set active trip: %s", e)


# ── Command routing ──────────────────────────────────────────────────────────

def handle_command(wa_user: dict, message: dict, phone: str) -> None:
    """Route slash commands and interactive responses."""
    msg_type = message.get("type", "text")

    # Interactive button/list reply
    if msg_type == "interactive":
        interactive = message.get("interactive", {})
        reply_type = interactive.get("type", "")

        if reply_type == "button_reply":
            reply_id = interactive.get("button_reply", {}).get("id", "")
        elif reply_type == "list_reply":
            reply_id = interactive.get("list_reply", {}).get("id", "")
        else:
            reply_id = ""

        _handle_interactive_reply(wa_user, reply_id, phone)
        return

    # Location message
    if msg_type == "location":
        location = message.get("location", {})
        lat = location.get("latitude", 0)
        lng = location.get("longitude", 0)
        # Construct a Google Maps URL and treat as a link
        from handlers.link_handler import handle_link
        fake_msg = {
            "type": "text",
            "text": {"body": f"https://www.google.com/maps?q={lat},{lng}"},
            "id": message.get("id", ""),
        }
        handle_link(wa_user, fake_msg, phone)
        return

    # Slash commands
    text = _get_text(message).lower().strip()

    if text == "/help":
        _cmd_help(phone)
    elif text == "/trip" or text == "/trips":
        _cmd_trip(wa_user, phone)
    elif text == "/status":
        _cmd_status(wa_user, phone)
    elif text == "/unlink":
        meta_api.send_text(
            phone,
            "To unlink your WhatsApp, go to Settings in the Triptomat app.",
        )
    else:
        meta_api.send_text(phone, f"Unknown command: {text}\nType /help for available commands.")


def _handle_interactive_reply(wa_user: dict, reply_id: str, phone: str) -> None:
    """Process interactive button/list replies."""
    if reply_id.startswith("trip:"):
        trip_id = reply_id[5:]
        # Look up trip name from the user's trips
        trips = get_active_trips(
            wa_user.get("user_id", ""), SUPABASE_URL, SUPABASE_SERVICE_KEY,
        )
        trip_name = "your trip"
        for t in trips:
            if t["id"] == trip_id:
                trip_name = t.get("name", "your trip")
                break
        _set_active_trip(phone, trip_id, trip_name)
    else:
        meta_api.send_text(phone, "Got it!")


def _cmd_help(phone: str) -> None:
    meta_api.send_text(
        phone,
        "*Triptomat Bot Commands*\n\n"
        "\U0001f517 *Send a link* — YouTube, website, or Google Maps link to analyze\n"
        "\U0001f4cd *Share location* — Look up a place\n"
        "/trip — Switch active trip\n"
        "/status — Current trip info\n"
        "/help — Show this message\n\n"
        "_More features coming soon: AI chat, booking forwarding, and trip Q&A!_",
    )


def _cmd_trip(wa_user: dict, phone: str) -> None:
    user_id = wa_user.get("user_id", "")
    _offer_trip_selection(phone, user_id)


def _cmd_status(wa_user: dict, phone: str) -> None:
    trip_id = wa_user.get("active_trip_id")
    if not trip_id:
        meta_api.send_text(phone, "No active trip selected. Use /trip to choose one.")
        return

    trips = get_active_trips(
        wa_user.get("user_id", ""), SUPABASE_URL, SUPABASE_SERVICE_KEY,
    )
    trip = next((t for t in trips if t["id"] == trip_id), None)
    if not trip:
        meta_api.send_text(phone, "Your active trip was not found. Use /trip to select one.")
        return

    name = trip.get("name", "Unnamed")
    countries = ", ".join(trip.get("countries") or []) or "Not set"
    start = trip.get("start_date", "?")
    end = trip.get("end_date", "?")

    meta_api.send_text(
        phone,
        f"*{name}*\n"
        f"\U0001f30d {countries}\n"
        f"\U0001f4c5 {start} \u2192 {end}\n\n"
        f"Send me links to add recommendations to this trip!",
    )


def _get_text(message: dict) -> str:
    if message.get("type") == "text":
        return (message.get("text") or {}).get("body", "").strip()
    return ""
