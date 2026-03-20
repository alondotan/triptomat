"""Supabase REST API client for fetching trip context data.

Uses urllib.request (no external dependencies) to match the pattern
already established in lambda_mail_handler/handler.py.
"""

import json
import urllib.request
import urllib.error
from typing import Optional


def _supabase_rpc(base_url: str, key: str, fn_name: str, params: dict) -> dict | None:
    """Call a Supabase RPC function via POST. Returns parsed JSON or None."""
    url = f"{base_url}/rest/v1/rpc/{fn_name}"
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"Supabase RPC {fn_name} failed {e.code}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Supabase RPC {fn_name} error: {e}")
        return None


def check_ai_usage(
    user_id: str, feature: str, supabase_url: str, supabase_key: str
) -> dict:
    """Check and increment daily AI usage. Fails open on errors."""
    result = _supabase_rpc(
        supabase_url, supabase_key,
        "check_and_increment_usage",
        {"p_user_id": user_id, "p_feature": feature},
    )
    if result and isinstance(result, dict):
        return result
    # Fail open — don't block users if Supabase is down
    return {"allowed": True, "remaining": 0, "limit": 0, "used": 0, "tier": "unknown"}


def _supabase_get(base_url: str, key: str, path_and_params: str) -> list | dict | None:
    """Make an authenticated GET request to Supabase REST API."""
    full_url = f"{base_url}{path_and_params}"
    req = urllib.request.Request(
        full_url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"Supabase GET failed {e.code}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Supabase GET error: {e}")
        return None


def get_user_id_from_token(
    token: str, supabase_url: str, supabase_key: str
) -> Optional[str]:
    """Look up user_id from webhook_tokens table."""
    result = _supabase_get(
        supabase_url, supabase_key,
        f"/rest/v1/webhook_tokens?token=eq.{token}&select=user_id&limit=1"
    )
    if result and isinstance(result, list) and len(result) > 0:
        return result[0].get("user_id")
    return None


def get_active_trips(
    user_id: str, supabase_url: str, supabase_key: str
) -> list[dict]:
    """Fetch non-completed trips for a user via trip_members, newest first."""
    # Query trip_members joined with trips (inner join via !inner)
    result = _supabase_get(
        supabase_url, supabase_key,
        f"/rest/v1/trip_members?user_id=eq.{user_id}"
        f"&select=trip_id,trips!inner(id,name,countries,start_date,end_date,status)"
        f"&trips.status=neq.completed"
        f"&limit=10"
    )
    if not isinstance(result, list):
        return []
    # Flatten: each row is {trip_id, trips: {id, name, ...}} -> extract the trips object
    trips = [row["trips"] for row in result if row.get("trips")]
    # Sort by start_date descending (newest first)
    trips.sort(key=lambda t: t.get("start_date") or "", reverse=True)
    return trips[:5]


def get_trip_entities(
    trip_id: str, supabase_url: str, supabase_key: str
) -> dict:
    """Fetch existing POIs, transportation, and contacts for a trip."""
    pois = _supabase_get(
        supabase_url, supabase_key,
        f"/rest/v1/points_of_interest?trip_id=eq.{trip_id}"
        f"&select=id,name,category,sub_category,location,details"
        f"&is_cancelled=is.false"
    ) or []

    transport = _supabase_get(
        supabase_url, supabase_key,
        f"/rest/v1/transportation?trip_id=eq.{trip_id}"
        f"&select=id,category,segments,booking,additional_info"
        f"&is_cancelled=is.false"
    ) or []

    contacts = _supabase_get(
        supabase_url, supabase_key,
        f"/rest/v1/contacts?trip_id=eq.{trip_id}"
        f"&select=id,name,role,phone,email,website"
    ) or []

    return {
        "existing_pois": pois,
        "existing_transport": transport,
        "existing_contacts": contacts,
    }


def fetch_trip_context(
    webhook_token: str,
    supabase_url: str,
    supabase_key: str,
    hint_countries: list[str] | None = None,
) -> Optional[dict]:
    """
    Main entry point: given a webhook_token, return the full trip context.

    Args:
        webhook_token: The user's webhook token.
        supabase_url: Supabase project URL.
        supabase_key: Supabase service role key.
        hint_countries: Countries from the incoming data, used to pick
                        the best trip if the user has multiple active trips.

    Returns:
        dict with trip_id, countries, start_date, end_date,
        existing_pois, existing_transport, existing_contacts.
        None if no matching trip found.
    """
    user_id = get_user_id_from_token(webhook_token, supabase_url, supabase_key)
    if not user_id:
        return None

    trips = get_active_trips(user_id, supabase_url, supabase_key)
    if not trips:
        return None

    # Pick the best trip: prefer one whose countries overlap with hint_countries
    selected_trip = trips[0]
    if hint_countries and len(trips) > 1:
        hint_lower = [c.lower() for c in hint_countries]
        for trip in trips:
            trip_countries = [c.lower() for c in (trip.get("countries") or [])]
            if any(c in trip_countries for c in hint_lower):
                selected_trip = trip
                break

    entities = get_trip_entities(selected_trip["id"], supabase_url, supabase_key)

    return {
        "trip_id": selected_trip["id"],
        "user_id": user_id,
        "countries": selected_trip.get("countries") or [],
        "start_date": selected_trip.get("start_date"),
        "end_date": selected_trip.get("end_date"),
        **entities,
    }
