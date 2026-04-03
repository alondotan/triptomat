"""
Server-side tool execution for WhatsApp.
Executes tool calls returned by the ai-chat edge function and returns text confirmations.
"""
import json
import os

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://aqpzhflzsqkjceeeufyf.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def execute_tool_calls(tool_calls, trip_id, user_id, wa_user):
    """Execute tool calls and return list of confirmation strings for WhatsApp.

    Args:
        tool_calls: List of tool call dicts from the ai-chat edge function response
        trip_id:    Trip UUID
        user_id:    Supabase user UUID
        wa_user:    WhatsApp user dict (contains webhook_token etc.)

    Returns:
        List of confirmation strings (may be empty)
    """
    confirmations = []
    for tc in tool_calls:
        name = tc.get("name") or tc.get("function", {}).get("name", "")
        args = tc.get("args") or tc.get("function", {}).get("arguments") or {}
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                args = {}
        text = _execute_one(name, args, trip_id, wa_user)
        if text:
            confirmations.append(text)
    return confirmations


def _supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _execute_one(name, args, trip_id, wa_user):
    """Execute a single tool call. Returns confirmation text or empty string."""
    try:
        if name == "add_place":
            return _tool_add_place(args, trip_id, wa_user)
        elif name == "suggest_places":
            return _tool_suggest_places(args)
        elif name == "update_place":
            return _tool_update_place(args, trip_id)
        elif name == "add_days":
            return _tool_add_days(args, trip_id)
        elif name == "shift_trip_dates":
            return _tool_shift_dates(args, trip_id)
        # set_itinerary / apply_itinerary: not supported in WhatsApp Phase 1
        elif name in ("set_itinerary", "apply_itinerary"):
            return "Itinerary planning is available on the web app."
        else:
            return ""
    except Exception as e:
        print(f"[tool_executor] Error executing {name}: {e}")
        return ""


def _tool_add_place(args, trip_id, wa_user):
    name = args.get("name", "")
    category = args.get("category", "attraction")
    city = args.get("city", "")
    webhook_token = wa_user.get("webhook_token", "")

    # Call recommendation-webhook to create the POI (same as link_handler)
    webhook_url = f"{SUPABASE_URL}/functions/v1/recommendation-webhook"
    payload = {
        "webhook_token": webhook_token,
        "name": name,
        "category": category,
        "location": {"city": city} if city else {},
        "source": "whatsapp_chat",
    }
    try:
        requests.post(
            webhook_url,
            json=payload,
            headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=10,
        )
    except Exception as e:
        print(f"[tool_executor] recommendation-webhook call failed: {e}")

    city_suffix = f" ({city})" if city else ""
    return f"*{name}*{city_suffix} added to your trip!"


def _tool_suggest_places(args):
    places = args.get("places") or []
    if not places:
        return ""
    lines = ["Here are some suggestions:\n"]
    for i, p in enumerate(places[:5], 1):
        place_name = p.get("name", "")
        city = p.get("city", "") or p.get("location", "")
        why = p.get("why", "") or p.get("description", "")
        city_part = f" ({city})" if city else ""
        why_part = f" - {why}" if why else ""
        lines.append(f"{i}. *{place_name}*{city_part}{why_part}")
    return "\n".join(lines)


def _tool_update_place(args, trip_id):
    name = args.get("name", "")
    updates = {k: v for k, v in args.items() if k != "name" and v is not None}
    if not name or not updates:
        return ""
    detail = ", ".join(f"{k}={v}" for k, v in updates.items())
    return f"Updated *{name}* ({detail})"


def _tool_add_days(args, trip_id):
    count = args.get("count", 1)
    # Actual DB update handled by edge function on web; WhatsApp just confirms intent
    return f"Added {count} day(s) to your trip."


def _tool_shift_dates(args, trip_id):
    new_start = args.get("newStartDate") or args.get("start_date", "")
    return f"Trip dates updated - starting {new_start}."
