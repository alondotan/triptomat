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

def handle_command(wa_user: dict, message: dict, phone: str, intent: str = "command") -> None:
    """Route slash commands, natural language intents, and interactive responses."""
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
        from handlers.link_handler import handle_link
        fake_msg = {
            "type": "text",
            "text": {"body": f"https://www.google.com/maps?q={lat},{lng}"},
            "id": message.get("id", ""),
        }
        handle_link(wa_user, fake_msg, phone)
        return

    raw_text = _get_text(message).strip()
    text = raw_text.lower()

    # Natural language intents (from classifier)
    if intent.startswith("cmd:"):
        _route_intent(intent, wa_user, phone, raw_text)
        return

    # Slash commands
    if text == "/help":
        _cmd_help(phone)
    elif text == "/trip" or text == "/trips":
        _cmd_trip(wa_user, phone)
    elif text == "/status":
        _cmd_status(wa_user, phone)
    elif text == "/tasks":
        _cmd_tasks(wa_user, phone)
    elif text.startswith("/task "):
        title = raw_text[6:].strip()
        _cmd_add_task(wa_user, phone, title)
    elif text.startswith("/done "):
        query = raw_text[6:].strip()
        _cmd_done_task(wa_user, phone, query)
    elif text == "/budget":
        _cmd_budget(wa_user, phone)
    elif text == "/unlink":
        meta_api.send_text(
            phone,
            "To unlink your WhatsApp, go to Settings in the Triptomat app.",
        )
    else:
        meta_api.send_text(phone, f"Unknown command: {text}\nType /help for available commands.")


def _route_intent(intent: str, wa_user: dict, phone: str, raw_text: str) -> None:
    """Route natural language intents to the appropriate command."""
    if intent == "cmd:help":
        _cmd_help(phone)
    elif intent == "cmd:tasks":
        _cmd_tasks(wa_user, phone)
    elif intent == "cmd:add_task":
        title = _extract_task_title(raw_text)
        if title:
            _cmd_add_task(wa_user, phone, title)
        else:
            meta_api.send_text(phone, "What task would you like to add?\nExample: /task Buy sunscreen")
    elif intent == "cmd:done":
        query = _extract_done_query(raw_text)
        if query:
            _cmd_done_task(wa_user, phone, query)
        else:
            _cmd_tasks(wa_user, phone)
    elif intent == "cmd:budget":
        _cmd_budget(wa_user, phone)
    elif intent == "cmd:trip":
        _cmd_trip(wa_user, phone)
    elif intent == "cmd:status":
        _cmd_status(wa_user, phone)


def _extract_task_title(text: str) -> str:
    """Extract the task title from natural language add-task messages."""
    import re
    # Try to extract what comes after the intent phrase
    patterns = [
        r"(?i)^/task\s+(.+)",
        r"(?i)(?:תוסיף|הוסף)\s*משימה\s*:?\s*(.+)",
        r"(?i)משימה\s*חדשה\s*:?\s*(.+)",
        r"(?i)תזכיר\s*לי\s*(?:ל|ש)(.+)",
        r"(?i)תוסיף\s*ל?רשימה\s*:?\s*(.+)",
        r"(?i)(?:add|new)\s*task\s*:?\s*(.+)",
        r"(?i)remind\s*me\s*to\s+(.+)",
        r"(?i)צריך\s*(?:לזכור|לא\s*לשכוח)\s*(?:ל|ש)(.+)",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1).strip()
    return ""


def _extract_done_query(text: str) -> str:
    """Extract the task reference from natural language done messages."""
    import re
    patterns = [
        r"(?i)^/done\s+(.+)",
        r"(?i)(?:סיימתי|עשיתי|ביצעתי)\s+(.+)",
        r"(?i)(?:completed?|finished|done\s*with)\s+(.+)",
        r"(?i)תסמן\s*(?:כ|ש)?\s*(.+)",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1).strip()
    return ""


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
    elif reply_id.startswith("done:"):
        mission_id = reply_id[5:]
        success = _update_mission_status(mission_id, "completed")
        if success:
            meta_api.send_text(phone, "\u2705 Task completed!")
        else:
            meta_api.send_text(phone, "Failed to update the task. Please try again.")
    else:
        meta_api.send_text(phone, "Got it!")


def _cmd_help(phone: str) -> None:
    meta_api.send_text(
        phone,
        "*Triptomat Bot Commands*\n\n"
        "\U0001f517 *Send a link* — YouTube, website, or Google Maps link to analyze\n"
        "\U0001f4cd *Share location* — Look up a place\n"
        "\U0001f4ce *Send a file* — Upload documents, photos, or PDFs to your trip\n"
        "/budget — Budget summary\n"
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


def _cmd_budget(wa_user: dict, phone: str) -> None:
    """Show a budget summary for the active trip."""
    import urllib.request

    trip_id = wa_user.get("active_trip_id")
    if not trip_id:
        meta_api.send_text(phone, "No active trip selected. Use /trip to choose one.")
        return

    # Fetch trip currency
    trips = get_active_trips(wa_user.get("user_id", ""), SUPABASE_URL, SUPABASE_SERVICE_KEY)
    trip = next((t for t in trips if t["id"] == trip_id), None)
    trip_currency = trip.get("currency", "EUR") if trip else "EUR"

    # Fetch all cost data in parallel-ish (sequential but fast)
    pois = _budget_query(
        f"/rest/v1/points_of_interest?trip_id=eq.{trip_id}"
        f"&is_cancelled=is.false&select=name,category,details,is_paid"
    ) or []
    transport = _budget_query(
        f"/rest/v1/transportation?trip_id=eq.{trip_id}"
        f"&is_cancelled=is.false&select=category,cost,is_paid,segments"
    ) or []
    expenses = _budget_query(
        f"/rest/v1/expenses?trip_id=eq.{trip_id}"
        f"&select=description,category,amount,currency,is_paid"
    ) or []

    # Aggregate
    categories = {
        "accommodation": {"total": 0, "paid": 0, "items": []},
        "transport": {"total": 0, "paid": 0, "items": []},
        "activities": {"total": 0, "paid": 0, "items": []},
        "other": {"total": 0, "paid": 0, "items": []},
    }

    grand_total = 0
    grand_paid = 0

    # POIs
    for p in pois:
        details = p.get("details") or {}
        cost_obj = details.get("cost") or {}
        amount = cost_obj.get("amount", 0) or 0
        if not amount:
            continue
        currency = cost_obj.get("currency", trip_currency)
        is_paid = p.get("is_paid", False)
        cat = p.get("category", "")
        name = p.get("name", "?")

        bucket = "accommodation" if cat == "accommodation" else (
            "activities" if cat in ("attraction", "eatery") else "other"
        )
        categories[bucket]["total"] += amount
        categories[bucket]["items"].append(
            {"name": name, "amount": amount, "currency": currency, "paid": is_paid}
        )
        if is_paid:
            categories[bucket]["paid"] += amount
        grand_total += amount
        if is_paid:
            grand_paid += amount

    # Transportation
    for t in transport:
        cost_obj = t.get("cost") or {}
        amount = cost_obj.get("total_amount", 0) or 0
        if not amount:
            continue
        currency = cost_obj.get("currency", trip_currency)
        is_paid = t.get("is_paid", False)
        # Build a name from segments
        segments = t.get("segments") or []
        if segments:
            seg = segments[0]
            fr = seg.get("from") or seg.get("departure") or {}
            to = seg.get("to") or seg.get("arrival") or {}
            fr_name = fr.get("city") or fr.get("name") or fr.get("code") or "?"
            to_name = to.get("city") or to.get("name") or to.get("code") or "?"
            name = f"{fr_name} \u2192 {to_name}"
        else:
            name = t.get("category", "Transport")

        categories["transport"]["total"] += amount
        categories["transport"]["items"].append(
            {"name": name, "amount": amount, "currency": currency, "paid": is_paid}
        )
        if is_paid:
            categories["transport"]["paid"] += amount
        grand_total += amount
        if is_paid:
            grand_paid += amount

    # Manual expenses
    for e in expenses:
        amount = e.get("amount", 0) or 0
        if not amount:
            continue
        currency = e.get("currency", trip_currency)
        is_paid = e.get("is_paid", False)
        name = e.get("description", "Expense")

        categories["other"]["total"] += amount
        categories["other"]["items"].append(
            {"name": name, "amount": amount, "currency": currency, "paid": is_paid}
        )
        if is_paid:
            categories["other"]["paid"] += amount
        grand_total += amount
        if is_paid:
            grand_paid += amount

    # Format message
    if grand_total == 0:
        meta_api.send_text(phone, "No budget data yet for this trip.")
        return

    grand_unpaid = grand_total - grand_paid

    lines = [
        f"*Budget Summary* \U0001f4b0\n",
        f"*Total:* {_fmt_money(grand_total, trip_currency)}",
        f"*Paid:* {_fmt_money(grand_paid, trip_currency)} \u2705",
        f"*Remaining:* {_fmt_money(grand_unpaid, trip_currency)}\n",
    ]

    # Category breakdown
    cat_labels = {
        "accommodation": "\U0001f3e8 Accommodation",
        "transport": "\u2708\ufe0f Transport",
        "activities": "\U0001f3ad Activities",
        "other": "\U0001f4cb Other",
    }
    for key, label in cat_labels.items():
        cat = categories[key]
        if cat["total"] > 0:
            unpaid = cat["total"] - cat["paid"]
            line = f"{label}: {_fmt_money(cat['total'], trip_currency)}"
            if unpaid > 0:
                line += f" ({_fmt_money(unpaid, trip_currency)} unpaid)"
            lines.append(line)

    # Top unpaid items
    all_items = []
    for cat in categories.values():
        all_items.extend(cat["items"])
    unpaid_items = [i for i in all_items if not i["paid"]]
    unpaid_items.sort(key=lambda x: x["amount"], reverse=True)

    if unpaid_items:
        lines.append("\n*Still to pay:*")
        for item in unpaid_items[:7]:
            lines.append(f"  \u2022 {item['name']}: {_fmt_money(item['amount'], item['currency'])}")
        if len(unpaid_items) > 7:
            lines.append(f"  _...and {len(unpaid_items) - 7} more_")

    meta_api.send_text(phone, "\n".join(lines))


def _budget_query(path_and_params: str) -> list | None:
    """Fetch data from Supabase for budget aggregation."""
    import urllib.request

    url = f"{SUPABASE_URL}{path_and_params}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        logger.error("Budget query failed: %s", e)
        return None


def _fmt_money(amount: float, currency: str) -> str:
    """Format a money amount with currency symbol."""
    symbols = {"USD": "$", "EUR": "\u20ac", "GBP": "\u00a3", "ILS": "\u20aa", "JPY": "\u00a5"}
    sym = symbols.get(currency, currency + " ")
    if currency in ("JPY",):
        return f"{sym}{amount:,.0f}"
    return f"{sym}{amount:,.2f}"


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

    # If there are pending tasks, send as interactive list with "Mark as Done" button
    if pending:
        rows = []
        for m in pending[:10]:
            title = m.get("title", "")
            due = m.get("due_date", "")
            due_str = f"Due {due[:10]}" if due else "No due date"
            rows.append({
                "id": f"done:{m['id']}",
                "title": title[:24],
                "description": due_str[:72],
            })
        meta_api.send_interactive_list(
            phone,
            "\n".join(lines),
            "\u2705 Mark as Done",
            [{"title": "Pending Tasks", "rows": rows}],
        )
    else:
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
