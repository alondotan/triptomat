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
    raw_text = _get_text(message).strip()
    text = raw_text.lower()

    if text == "/help":
        _cmd_help(phone)
    elif text == "/trip" or text == "/trips":
        _cmd_trip(wa_user, phone)
    elif text == "/status":
        _cmd_status(wa_user, phone)
    elif text == "/tasks":
        _cmd_tasks(wa_user, phone)
    elif text.startswith("/task "):
        # Use raw text to preserve original casing for the task title
        title = raw_text[6:].strip()
        _cmd_add_task(wa_user, phone, title)
    elif text.startswith("/done "):
        query = raw_text[6:].strip()
        _cmd_done_task(wa_user, phone, query)
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
        "\U0001f4ce *Send a file* — Upload documents, photos, or PDFs to your trip\n"
        "/tasks — List trip tasks\n"
        "/task Buy sunscreen — Add a new task\n"
        "/done Buy sunscreen — Mark a task as done\n"
        "/trip — Switch active trip\n"
        "/status — Current trip info\n"
        "/help — Show this message\n\n"
        "_More features coming soon: booking forwarding, and trip Q&A!_",
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


def _cmd_tasks(wa_user: dict, phone: str) -> None:
    """List pending tasks (missions) for the active trip."""
    trip_id = wa_user.get("active_trip_id")
    if not trip_id:
        meta_api.send_text(phone, "No active trip selected. Use /trip to choose one.")
        return

    missions = _fetch_missions(trip_id)
    if missions is None:
        meta_api.send_text(phone, "Failed to fetch tasks. Please try again.")
        return

    pending = [m for m in missions if m.get("status") == "pending"]
    completed = [m for m in missions if m.get("status") == "completed"]

    if not missions:
        meta_api.send_text(phone, "No tasks yet.\nAdd one with: /task Buy sunscreen")
        return

    lines = [f"*Tasks* ({len(pending)} pending, {len(completed)} done)\n"]

    if pending:
        for m in pending:
            title = m.get("title", "")
            due = m.get("due_date", "")
            due_str = f" (due {due[:10]})" if due else ""
            lines.append(f"\u2b1c {title}{due_str}")

    if completed:
        lines.append("")
        for m in completed[:5]:
            lines.append(f"\u2705 ~{m.get('title', '')}~")
        if len(completed) > 5:
            lines.append(f"_...and {len(completed) - 5} more completed_")

    meta_api.send_text(phone, "\n".join(lines))


def _cmd_add_task(wa_user: dict, phone: str, title: str) -> None:
    """Add a new task (mission) to the active trip."""
    trip_id = wa_user.get("active_trip_id")
    if not trip_id:
        meta_api.send_text(phone, "No active trip selected. Use /trip to choose one.")
        return

    if not title:
        meta_api.send_text(phone, "Usage: /task <title>\nExample: /task Buy travel adapter")
        return

    if len(title) > 200:
        meta_api.send_text(phone, "Task title is too long (max 200 characters).")
        return

    success = _create_mission(trip_id, title)
    if success:
        meta_api.send_text(phone, f"\u2705 Task added: *{title}*")
    else:
        meta_api.send_text(phone, "Failed to add the task. Please try again.")


def _fetch_missions(trip_id: str) -> list[dict] | None:
    """Fetch missions for a trip from Supabase."""
    import urllib.request
    import urllib.error

    url = (
        f"{SUPABASE_URL}/rest/v1/missions"
        f"?trip_id=eq.{trip_id}&order=created_at.asc"
        f"&select=id,title,status,due_date"
    )
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        logger.error("Failed to fetch missions: %s", e)
        return None


def _create_mission(trip_id: str, title: str) -> bool:
    """Create a new mission in Supabase."""
    import urllib.request
    import urllib.error

    url = f"{SUPABASE_URL}/rest/v1/missions"
    data = json.dumps({
        "trip_id": trip_id,
        "title": title,
        "status": "pending",
    }).encode()

    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception as e:
        logger.error("Failed to create mission: %s", e)
        return False


def _cmd_done_task(wa_user: dict, phone: str, query: str) -> None:
    """Mark a pending task as completed by fuzzy title match."""
    trip_id = wa_user.get("active_trip_id")
    if not trip_id:
        meta_api.send_text(phone, "No active trip selected. Use /trip to choose one.")
        return

    if not query:
        meta_api.send_text(phone, "Usage: /done <task title>\nExample: /done Buy sunscreen")
        return

    missions = _fetch_missions(trip_id)
    if missions is None:
        meta_api.send_text(phone, "Failed to fetch tasks. Please try again.")
        return

    pending = [m for m in missions if m.get("status") == "pending"]
    if not pending:
        meta_api.send_text(phone, "No pending tasks to complete.")
        return

    # Find best match — case-insensitive substring, then startswith, then contains
    query_lower = query.lower()
    match = None

    # Exact match
    for m in pending:
        if m["title"].lower() == query_lower:
            match = m
            break

    # Starts-with match
    if not match:
        for m in pending:
            if m["title"].lower().startswith(query_lower):
                match = m
                break

    # Substring match
    if not match:
        for m in pending:
            if query_lower in m["title"].lower():
                match = m
                break

    # Word overlap match
    if not match:
        query_words = set(query_lower.split())
        best_score = 0
        for m in pending:
            title_words = set(m["title"].lower().split())
            overlap = len(query_words & title_words)
            if overlap > best_score:
                best_score = overlap
                match = m
        if best_score == 0:
            match = None

    if not match:
        titles = "\n".join(f"  \u2022 {m['title']}" for m in pending[:10])
        meta_api.send_text(
            phone,
            f"No matching task found for \"{query}\".\n\nPending tasks:\n{titles}",
        )
        return

    success = _update_mission_status(match["id"], "completed")
    if success:
        meta_api.send_text(phone, f"\u2705 Done: ~{match['title']}~")
    else:
        meta_api.send_text(phone, "Failed to update the task. Please try again.")


def _update_mission_status(mission_id: str, status: str) -> bool:
    """Update a mission's status in Supabase."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/missions?id=eq.{mission_id}"
    data = json.dumps({"status": status}).encode()

    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception as e:
        logger.error("Failed to update mission %s: %s", mission_id, e)
        return False


def _get_text(message: dict) -> str:
    if message.get("type") == "text":
        return (message.get("text") or {}).get("body", "").strip()
    return ""
