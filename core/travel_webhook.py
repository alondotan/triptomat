"""Process travel email webhook payloads.

Ports the Supabase Edge Function `travel-webhook/index.ts` to Python.
Called directly from mail_handler after email parsing + reconciliation.

Uses core.supabase_db for all database operations,
core.enrich_poi for POI enrichment (fire-and-forget),
core.map_utils for hierarchy extraction and fuzzy matching.
"""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from core import supabase_db as db
from core.enrich_poi import enrich_poi
from core.map_utils import extract_cities, extract_countries, fuzzy_match

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

MS_PER_DAY = 86_400_000


# ── Merge helper ─────────────────────────────────────────────────


def _has_value(v: Any) -> bool:
    """Return True if *v* is considered present (not None or empty string)."""
    return v is not None and v != ""


def merge_with_new_wins(old: Any, incoming: Any) -> Any:
    """Merge two values: incoming wins when both have a value.

    If incoming is None or empty string, the old value is preserved.
    Arrays/lists are replaced entirely by the new value.
    Dicts are merged recursively.
    """
    if not _has_value(incoming):
        return old
    if not isinstance(incoming, dict) or isinstance(incoming, list):
        return incoming
    if not isinstance(old, dict) or old is None or isinstance(old, list):
        return incoming
    result = {**old}
    for key in incoming:
        result[key] = merge_with_new_wins(old.get(key), incoming[key])
    return result


# ── Date helpers ─────────────────────────────────────────────────


def _to_utc_ms(date_str: str) -> int:
    """Convert a YYYY-MM-DD string to UTC milliseconds."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def days_between(start: str, end: str) -> int:
    """Number of days between two YYYY-MM-DD strings (at least 1)."""
    diff_ms = _to_utc_ms(end) - _to_utc_ms(start)
    return max(1, math.ceil(diff_ms / MS_PER_DAY))


# ── Notification helper (fire-and-forget) ────────────────────────


def _notify_fire_and_forget(
    user_ids: list[str],
    title: str,
    body: str,
    source_email_id: str,
    category: str,
    action: str,
) -> None:
    """Send push + WhatsApp notifications via Edge Functions (fire-and-forget)."""
    supa_url = SUPABASE_URL or os.environ.get("SUPABASE_URL", "")
    svc_key = SUPABASE_SERVICE_KEY or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supa_url or not svc_key:
        logger.warning("[notify] SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {svc_key}",
    }

    # Push notification
    try:
        push_url = f"{supa_url}/functions/v1/send-notification"
        push_body = json.dumps({
            "user_ids": user_ids,
            "title": title,
            "body": body,
            "url": "/inbox",
            "tag": f"email-{source_email_id}",
        }).encode("utf-8")
        req = urllib.request.Request(push_url, data=push_body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as e:
        logger.error(f"Push notification failed: {e}")

    # WhatsApp notification
    try:
        wa_url = f"{supa_url}/functions/v1/whatsapp-notify"
        wa_body = json.dumps({
            "user_ids": user_ids,
            "type": "booking_confirmed",
            "text": f"\U0001f4e7 {title}: {body}",
            "template_name": "booking_confirmed",
            "template_params": [title, body],
        }).encode("utf-8")
        req = urllib.request.Request(wa_url, data=wa_body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as e:
        logger.error(f"WhatsApp notification failed: {e}")


# ── Itinerary day helpers ────────────────────────────────────────


def unlink_accommodation_from_days(trip_id: str, poi_id: str) -> None:
    """Remove a POI from accommodation_options on all itinerary days."""
    days = db.query("itinerary_days", {"trip_id": trip_id}, select="id,accommodation_options") or []
    for day in days:
        opts = day.get("accommodation_options") or []
        filtered = [a for a in opts if a.get("poi_id") != poi_id]
        if len(filtered) != len(opts):
            db.update("itinerary_days", {"id": day["id"]}, {"accommodation_options": filtered})


def unlink_transport_from_days(trip_id: str, transport_id: str) -> None:
    """Remove a transport from transportation_segments on all itinerary days."""
    days = db.query("itinerary_days", {"trip_id": trip_id}, select="id,transportation_segments") or []
    for day in days:
        segs = day.get("transportation_segments") or []
        filtered = [s for s in segs if s.get("transportation_id") != transport_id]
        if len(filtered) != len(segs):
            db.update("itinerary_days", {"id": day["id"]}, {"transportation_segments": filtered})


def ensure_day_and_link(
    trip_id: str,
    trip_start: str,
    trip_end: str,
    days: list[dict],
    date_str: str,
    link_fn: Any,
) -> None:
    """Ensure an itinerary day exists for *date_str* and invoke *link_fn* on it.

    If the day doesn't exist, creates it with an appropriate day_number.
    *days* is mutated in-place (new day appended) so callers see the update.
    """
    if date_str < trip_start or date_str > trip_end:
        return

    day = next((d for d in days if d.get("date") == date_str), None)

    if day is None:
        used = {d.get("day_number") for d in days}
        num = max(1, math.floor((_to_utc_ms(date_str) - _to_utc_ms(trip_start)) / MS_PER_DAY) + 1)
        while num in used:
            num += 1
        created = db.insert(
            "itinerary_days",
            {"trip_id": trip_id, "day_number": num, "date": date_str},
            select="*",
        )
        if created:
            row = created[0] if isinstance(created, list) else created
            days.append(row)
            day = row

    if day is not None:
        link_fn(day)


def link_accommodation_to_days(trip_id: str, poi_id: str, checkin: str, checkout: str) -> None:
    """Link a POI to all itinerary nights from checkin to checkout-1."""
    trip_data = db.query("trips", {"id": trip_id}, select="start_date,end_date", single=True)
    if not trip_data:
        return
    existing_days = db.query(
        "itinerary_days", {"trip_id": trip_id}, select="*", order="day_number.asc",
    ) or []

    ms_checkin = _to_utc_ms(checkin)
    ms_checkout = _to_utc_ms(checkout)

    ms = ms_checkin
    while ms < ms_checkout:
        night_date = datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d")

        def _link_accom(day: dict, _poi_id: str = poi_id) -> None:
            opts = day.get("accommodation_options") or []
            if not any(a.get("poi_id") == _poi_id for a in opts):
                opts.append({"is_selected": True, "poi_id": _poi_id})
                db.update("itinerary_days", {"id": day["id"]}, {"accommodation_options": opts})

        ensure_day_and_link(
            trip_id, trip_data["start_date"], trip_data["end_date"],
            existing_days, night_date, _link_accom,
        )
        ms += MS_PER_DAY


def link_transport_segments_to_days(
    trip_id: str,
    transport_id: str,
    segments: list[dict],
) -> None:
    """Link transport segments to itinerary days by departure date."""
    trip_data = db.query("trips", {"id": trip_id}, select="start_date,end_date", single=True)
    if not trip_data:
        return
    existing_days = db.query(
        "itinerary_days", {"trip_id": trip_id}, select="*", order="day_number.asc",
    ) or []

    for seg in segments:
        dep_time = seg.get("departure_time")
        if not dep_time:
            continue
        dep_date = dep_time.split("T")[0]
        seg_id = seg.get("segment_id")

        def _link_transport(
            day: dict,
            _tid: str = transport_id,
            _sid: str = seg_id,
        ) -> None:
            segs_list = day.get("transportation_segments") or []
            if not any(
                s.get("transportation_id") == _tid and s.get("segment_id") == _sid
                for s in segs_list
            ):
                segs_list.append({
                    "is_selected": True,
                    "transportation_id": _tid,
                    "segment_id": _sid,
                })
                db.update("itinerary_days", {"id": day["id"]}, {"transportation_segments": segs_list})
                # Keep in-memory object current so same-day segments don't overwrite
                day["transportation_segments"] = segs_list

        ensure_day_and_link(
            trip_id, trip_data["start_date"], trip_data["end_date"],
            existing_days, dep_date, _link_transport,
        )


# ── Find existing entities ───────────────────────────────────────


def find_existing_poi(trip_id: str, order_number: str, category: str) -> dict | None:
    """Find a POI by trip_id + category + order_number in details JSONB."""
    rows = db.query_contains(
        "points_of_interest",
        column="details",
        json_value={"order_number": order_number},
        extra_filters={"trip_id": trip_id, "category": category},
    )
    return rows[0] if rows else None


def find_existing_transport(trip_id: str, order_number: str) -> dict | None:
    """Find transport by trip_id + order_number in booking JSONB."""
    rows = db.query_contains(
        "transportation",
        column="booking",
        json_value={"order_number": order_number},
        extra_filters={"trip_id": trip_id},
    )
    return rows[0] if rows else None


def find_existing_poi_by_name_and_location(
    trip_id: str, name: str, category: str, city: str | None = None
) -> dict | None:
    """Fuzzy-match by name + category (+ city when both have it).

    Used as fallback when no order_number match.
    """
    rows = db.query(
        "points_of_interest",
        {"trip_id": trip_id, "category": category},
    )
    if not rows:
        return None
    for poi in rows:
        if not fuzzy_match(poi.get("name"), name):
            continue
        poi_city = (poi.get("location") or {}).get("city")
        # If both have a city value, they must match
        if city and poi_city and not fuzzy_match(poi_city, city):
            continue
        return poi
    return None


# ── Source refs helper ───────────────────────────────────────────


def add_email_to_source_refs(existing_refs: dict | None, email_id: str) -> dict:
    """Add an email_id to source_refs, deduplicating."""
    refs = existing_refs or {"email_ids": [], "recommendation_ids": []}
    email_ids = refs.get("email_ids") or []
    if email_id not in email_ids:
        email_ids.append(email_id)
    return {**refs, "email_ids": email_ids}


# ── Extract event date ───────────────────────────────────────────


def extract_event_date(payload: dict) -> str | None:
    """Return the actual event date (not processing date) from the payload."""
    metadata = payload.get("metadata", {})
    category = metadata.get("category")

    if category == "transportation":
        segments = (payload.get("transportation_details") or {}).get("segments") or []
        if segments:
            dep = segments[0].get("departure_time")
            if dep:
                return dep.split("T")[0]

    if category == "accommodation":
        checkin = (payload.get("accommodation_details") or {}).get("checkin_date")
        if checkin:
            return checkin

    if category == "attraction":
        res_date = (payload.get("attraction_details") or {}).get("reservation_date")
        if res_date:
            return res_date

    if category == "eatery":
        res_date = (payload.get("eatery_details") or {}).get("reservation_date")
        if res_date:
            return res_date

    return metadata.get("date") or None


# ── Sync sites hierarchy to trip_locations ───────────────────────


def _sync_sites_hierarchy(trip_id: str, hierarchy: list[dict]) -> None:
    """Insert site hierarchy nodes into trip_locations table.

    Walks the hierarchy tree and inserts missing nodes (by name, case-insensitive).
    """
    existing = db.query("trip_locations", {"trip_id": trip_id}, select="id,name,parent_id") or []
    name_to_id: dict[str, str] = {}
    for loc in existing:
        name_to_id[loc["name"].lower()] = loc["id"]

    def walk_and_insert(nodes: list[dict], parent_id: str | None) -> None:
        for node in nodes:
            key = node["site"].lower()
            node_id = name_to_id.get(key)
            if node_id is None:
                inserted = db.insert(
                    "trip_locations",
                    {
                        "trip_id": trip_id,
                        "parent_id": parent_id,
                        "name": node["site"],
                        "site_type": node.get("site_type"),
                        "source": "webhook",
                    },
                    select="id",
                )
                if inserted:
                    row = inserted[0] if isinstance(inserted, list) else inserted
                    node_id = row["id"]
                    name_to_id[key] = node_id
            if node_id and node.get("sub_sites"):
                walk_and_insert(node["sub_sites"], node_id)

    walk_and_insert(hierarchy, None)


# ── Save attachments helper ──────────────────────────────────────

_DOC_CATEGORY_MAP = {
    "transportation": "flight",
    "accommodation": "hotel",
    "attraction": "activity",
    "eatery": "activity",
}


def _save_attachments(
    attachments: list[dict],
    user_id: str,
    trip_id: str | None,
    category: str,
    subject: str,
) -> None:
    """Save email attachments to the documents table (skip duplicates by storage_path)."""
    doc_category = _DOC_CATEGORY_MAP.get(category, "other")

    for att in attachments:
        # Skip if already saved
        existing_doc = db.query(
            "documents", {"storage_path": att["s3_key"]}, select="id", single=True,
        )
        if existing_doc:
            continue

        result = db.insert("documents", {
            "user_id": user_id,
            "trip_id": trip_id,
            "category": doc_category,
            "name": att["filename"],
            "file_name": att["filename"],
            "file_size": att.get("size"),
            "mime_type": att.get("content_type"),
            "storage_path": att["s3_key"],
            "notes": f"From email: {subject}",
        })
        if result:
            logger.info(f"Saved document: {att['filename']}")
        else:
            logger.error(f"Failed to insert document: {att['filename']}")


# ── Fire-and-forget enrichment ───────────────────────────────────


def _enrich_fire_and_forget(
    poi_id: str, name: str, city: str = "", country: str = "", address: str = ""
) -> None:
    """Run enrich_poi in a daemon thread (fire-and-forget)."""
    def _run():
        try:
            enrich_poi(poi_id, name, city=city, country=country, address=address)
        except Exception as e:
            logger.error(f"[enrich] Fire-and-forget enrichment failed for {poi_id}: {e}")

    threading.Thread(target=_run, daemon=True).start()


# ── Main entry point ─────────────────────────────────────────────


def process_travel_email(payload: dict, user_id: str | None) -> dict:
    """Process a travel email webhook payload.

    This replaces the Supabase Edge Function travel-webhook.
    Called directly from mail_handler after email parsing + reconciliation.

    Args:
        payload: The full webhook payload (metadata, sites_hierarchy,
                 accommodation_details, etc.)
        user_id: The resolved user ID (from webhook token lookup)

    Returns:
        dict with: success, source_email_id, action, matched, trip_id,
                   linked_entities, status
    """
    metadata = payload.get("metadata", {})
    source_email_info = payload.get("source_email_info") or {}
    sites_hierarchy = payload.get("sites_hierarchy") or []
    action = metadata.get("action", "create")
    order_number = metadata.get("order_number", "")
    category = metadata.get("category", "")

    logger.info(f"Received webhook: {json.dumps(metadata)}, userId: {user_id}")

    # ── Dedup by unique email (order_number + date_sent) ──
    email_unique_id = f"{order_number}::{source_email_info.get('date_sent', 'no-date')}"
    existing_email = db.query(
        "source_emails", {"email_id": email_unique_id}, select="id", single=True,
    )

    if existing_email:
        logger.info("Exact same email already processed — saving any new attachments then skipping")
        # Still save attachments even for duplicate emails
        attachments = payload.get("attachments") or []
        if attachments and user_id:
            existing_src = db.query(
                "source_emails", {"id": existing_email["id"]}, select="trip_id", single=True,
            )
            trip_id = (existing_src or {}).get("trip_id")
            _save_attachments(
                attachments, user_id, trip_id, category,
                source_email_info.get("subject", ""),
            )
        return {"success": True, "action": "duplicate_skipped"}

    # ── Match trip (scoped to user if provided) ──
    event_countries = extract_countries(sites_hierarchy) if sites_hierarchy else []
    hierarchy_cities = extract_cities(sites_hierarchy) if sites_hierarchy else []
    matched_trip_id: str | None = None

    event_date = extract_event_date(payload)
    if event_date and event_countries:
        trips: list[dict] = []
        if user_id:
            # Look up trips via trip_members join, filtered by event date range
            member_rows = db.query(
                "trip_members",
                {"user_id": user_id},
                select="trip_id,trips(id,countries,start_date,end_date)",
            ) or []
            for r in member_rows:
                trip = r.get("trips")
                if not trip:
                    continue
                if trip.get("start_date", "") <= event_date <= trip.get("end_date", ""):
                    trips.append(trip)
        else:
            # No user scoping — query all trips covering the event date
            # supabase_db.query only supports eq filters, so we fetch broadly
            # and filter in Python (lte/gte not directly supported).
            all_trips = db.query("trips", {}, select="id,countries,start_date,end_date") or []
            trips = [
                t for t in all_trips
                if t.get("start_date", "") <= event_date <= t.get("end_date", "")
            ]

        for trip in trips:
            tc = [c.lower() for c in (trip.get("countries") or [])]
            if any(ec.lower() in tc for ec in event_countries):
                matched_trip_id = trip["id"]
                break

    logger.info(
        f"Event date used for matching: {event_date}, metadata.date was: {metadata.get('date')}"
    )
    logger.info(f"Trip: {matched_trip_id or 'none'}, Action: {action}")

    # ── Store source email ──
    source_email_rows = db.insert("source_emails", {
        "email_id": email_unique_id,
        "trip_id": matched_trip_id,
        "status": "linked" if matched_trip_id else "pending",
        "source_email_info": source_email_info,
        "parsed_data": payload,
        "linked_entities": [],
    }, select="id")

    if not source_email_rows:
        raise RuntimeError("Failed to insert source_email record")

    source_email_id = source_email_rows[0]["id"]
    linked_entities: list[dict] = []

    # ── Process entity (if matched to trip) ──
    if matched_trip_id:
        first_country = event_countries[0] if event_countries else None

        # ── CANCEL ──
        if action == "cancel":
            if category == "transportation":
                existing = find_existing_transport(matched_trip_id, order_number)
                if existing:
                    db.update("transportation", {"id": existing["id"]}, {
                        "is_cancelled": True,
                        "source_refs": add_email_to_source_refs(
                            existing.get("source_refs"), source_email_id,
                        ),
                    })
                    unlink_transport_from_days(matched_trip_id, existing["id"])
                    linked_entities.append({
                        "entity_type": "transportation",
                        "entity_id": existing["id"],
                        "description": "Transportation (cancelled)",
                    })
            else:
                existing = find_existing_poi(matched_trip_id, order_number, category)
                if existing:
                    db.update("points_of_interest", {"id": existing["id"]}, {
                        "is_cancelled": True,
                        "source_refs": add_email_to_source_refs(
                            existing.get("source_refs"), source_email_id,
                        ),
                    })
                    if category == "accommodation":
                        unlink_accommodation_from_days(matched_trip_id, existing["id"])
                    linked_entities.append({
                        "entity_type": "poi",
                        "entity_id": existing["id"],
                        "description": f"{category} (cancelled)",
                    })

        # ── CREATE / UPDATE (upsert) ──
        else:
            if category == "accommodation" and payload.get("accommodation_details"):
                _handle_accommodation(
                    payload, matched_trip_id, order_number, source_email_id,
                    linked_entities, hierarchy_cities, first_country, metadata,
                )

            elif category == "transportation" and payload.get("transportation_details"):
                _handle_transportation(
                    payload, matched_trip_id, order_number, source_email_id,
                    linked_entities, metadata,
                )

            elif category in ("attraction", "eatery"):
                _handle_attraction_or_eatery(
                    payload, matched_trip_id, order_number, source_email_id,
                    linked_entities, hierarchy_cities, first_country, metadata,
                )

        # Sync sites_hierarchy into trip_locations table
        if sites_hierarchy:
            try:
                _sync_sites_hierarchy(matched_trip_id, sites_hierarchy)
            except Exception as e:
                logger.error(f"Failed to sync sites hierarchy to trip_locations: {e}")

        # Update source_email with linked entities
        if linked_entities:
            db.update(
                "source_emails", {"id": source_email_id},
                {"linked_entities": linked_entities},
            )

        # Send notifications to trip members (fire-and-forget)
        members = db.query("trip_members", {"trip_id": matched_trip_id}, select="user_id") or []
        if members:
            entity_name = linked_entities[0]["description"] if linked_entities else category
            subject = source_email_info.get("subject") or entity_name
            if action == "cancel":
                action_label = "Cancelled"
            elif any("updated" in e.get("description", "") for e in linked_entities):
                action_label = "Updated"
            else:
                action_label = "New"
            category_label = "transport" if category == "transportation" else category
            title = f"{action_label} {category_label}"
            body = subject

            user_ids = [m["user_id"] for m in members]
            threading.Thread(
                target=_notify_fire_and_forget,
                args=(user_ids, title, body, source_email_id, category, action),
                daemon=True,
            ).start()

    # ── Save attachments to documents table (regardless of trip match) ──
    attachments = payload.get("attachments") or []
    if attachments and user_id:
        _save_attachments(
            attachments, user_id, matched_trip_id, category,
            source_email_info.get("subject", ""),
        )

    return {
        "success": True,
        "source_email_id": source_email_id,
        "action": action,
        "matched": matched_trip_id is not None,
        "trip_id": matched_trip_id,
        "linked_entities": linked_entities,
        "status": "linked" if matched_trip_id else "pending",
    }


# ── Category handlers ────────────────────────────────────────────


def _handle_accommodation(
    payload: dict,
    trip_id: str,
    order_number: str,
    source_email_id: str,
    linked_entities: list[dict],
    hierarchy_cities: list[str],
    first_country: str | None,
    metadata: dict,
) -> None:
    """Handle accommodation create/update."""
    accom = payload["accommodation_details"]
    cost = accom.get("cost")
    loc = accom.get("location_details") or {}
    city = loc.get("city") or (hierarchy_cities[0] if hierarchy_cities else None)
    country = loc.get("country") or first_country

    checkin_date = accom.get("checkin_date")
    checkout_date = accom.get("checkout_date")

    price_per_night = None
    if cost and checkin_date and checkout_date:
        price_per_night = cost["amount"] / days_between(checkin_date, checkout_date)
    elif cost:
        price_per_night = cost.get("amount")

    new_data = {
        "category": "accommodation",
        "place_type": metadata.get("place_type") or "hotel",
        "name": accom.get("establishment_name") or "Accommodation",
        "status": "booked",
        "is_cancelled": False,
        "location": {"address": loc.get("street"), "city": city, "country": country},
        "details": {
            "cost": {"amount": cost["amount"], "currency": cost["currency"]} if cost else None,
            "order_number": order_number,
            "accommodation_details": {
                "rooms": [
                    {"room_type": r.get("room_type"), "occupancy": r.get("occupancy_details")}
                    for r in (accom.get("rooms") or [])
                ],
                "checkin": {"date": checkin_date, "hour": accom.get("checkin_hour")},
                "checkout": {"date": checkout_date, "hour": accom.get("checkout_hour")},
                "free_cancellation_until": accom.get("free_cancellation_until"),
                "price_per_night": price_per_night,
            },
        },
    }

    existing = find_existing_poi(trip_id, order_number, "accommodation")
    if not existing:
        existing = find_existing_poi_by_name_and_location(
            trip_id, accom.get("establishment_name", ""), "accommodation", city,
        )

    if existing:
        # UPDATE existing
        merged = {
            **new_data,
            "location": merge_with_new_wins(existing.get("location"), new_data["location"]),
            "details": merge_with_new_wins(existing.get("details"), new_data["details"]),
            "source_refs": add_email_to_source_refs(existing.get("source_refs"), source_email_id),
        }
        if not accom.get("establishment_name"):
            merged["name"] = existing.get("name", "Accommodation")

        db.update("points_of_interest", {"id": existing["id"]}, merged)
        linked_entities.append({
            "entity_type": "poi",
            "entity_id": existing["id"],
            "description": "Accommodation (updated)",
        })

        # Fire-and-forget enrich if missing coords or image
        if not (existing.get("location") or {}).get("coordinates", {}).get("lat") or not existing.get("image_url"):
            _enrich_fire_and_forget(
                existing["id"],
                merged.get("name") or existing.get("name", ""),
                city=merged.get("location", {}).get("city", ""),
                country=merged.get("location", {}).get("country", ""),
                address=merged.get("location", {}).get("address", ""),
            )

        # Re-link itinerary days if dates changed
        merged_accom = (merged.get("details") or {}).get("accommodation_details") or {}
        new_checkin = (merged_accom.get("checkin") or {}).get("date")
        new_checkout = (merged_accom.get("checkout") or {}).get("date")
        if new_checkin and new_checkout:
            unlink_accommodation_from_days(trip_id, existing["id"])
            link_accommodation_to_days(trip_id, existing["id"], new_checkin, new_checkout)
    else:
        # CREATE new
        rows = db.insert("points_of_interest", {
            "trip_id": trip_id,
            **new_data,
            "is_paid": metadata.get("is_paid", False),
            "source_refs": {"email_ids": [source_email_id], "recommendation_ids": []},
        }, select="id")

        if rows:
            poi_id = rows[0]["id"]
            linked_entities.append({
                "entity_type": "poi",
                "entity_id": poi_id,
                "description": "Accommodation",
            })
            if checkin_date and checkout_date:
                link_accommodation_to_days(trip_id, poi_id, checkin_date, checkout_date)
            _enrich_fire_and_forget(
                poi_id, new_data["name"],
                city=new_data["location"].get("city", ""),
                country=new_data["location"].get("country", ""),
                address=new_data["location"].get("address", ""),
            )


def _handle_transportation(
    payload: dict,
    trip_id: str,
    order_number: str,
    source_email_id: str,
    linked_entities: list[dict],
    metadata: dict,
) -> None:
    """Handle transportation create/update."""
    transport = payload["transportation_details"]
    cost = transport.get("cost")
    raw_segments = transport.get("segments") or []

    built_segments = [
        {
            "segment_id": f"seg_{i}",
            "from": s.get("from"),
            "to": s.get("to"),
            "departure_time": s.get("departure_time"),
            "arrival_time": s.get("arrival_time"),
            "carrier_code": s.get("carrier"),
            "flight_or_vessel_number": s.get("flight_number"),
        }
        for i, s in enumerate(raw_segments)
    ]

    new_data = {
        "category": (metadata.get("place_type") or "flight").lower(),
        "status": "booked",
        "is_cancelled": False,
        "cost": {
            "total_amount": cost.get("amount", 0) if cost else 0,
            "currency": cost.get("currency", "USD") if cost else "USD",
        },
        "booking": {
            "order_number": order_number,
            "carrier_name": raw_segments[0].get("carrier") if raw_segments else None,
            "baggage_allowance": transport.get("baggage_allowance"),
            "free_cancellation_until": transport.get("free_cancellation_until"),
        },
        "segments": built_segments,
        "additional_info": {},
    }

    existing = find_existing_transport(trip_id, order_number)

    if existing:
        merged = {
            **new_data,
            "cost": merge_with_new_wins(existing.get("cost"), new_data["cost"]),
            "booking": merge_with_new_wins(existing.get("booking"), new_data["booking"]),
            "segments": built_segments if built_segments else existing.get("segments", []),
            "source_refs": add_email_to_source_refs(existing.get("source_refs"), source_email_id),
        }
        db.update("transportation", {"id": existing["id"]}, merged)
        linked_entities.append({
            "entity_type": "transportation",
            "entity_id": existing["id"],
            "description": "Transportation (updated)",
        })

        # Re-link itinerary days
        unlink_transport_from_days(trip_id, existing["id"])
        link_transport_segments_to_days(
            trip_id, existing["id"],
            [{"segment_id": s["segment_id"], "departure_time": s.get("departure_time")} for s in built_segments],
        )
    else:
        rows = db.insert("transportation", {
            "trip_id": trip_id,
            **new_data,
            "is_paid": metadata.get("is_paid", True),
            "source_refs": {"email_ids": [source_email_id], "recommendation_ids": []},
        }, select="id")

        if rows:
            t_id = rows[0]["id"]
            linked_entities.append({
                "entity_type": "transportation",
                "entity_id": t_id,
                "description": "Transportation",
            })
            link_transport_segments_to_days(
                trip_id, t_id,
                [{"segment_id": s["segment_id"], "departure_time": s.get("departure_time")} for s in built_segments],
            )


def _handle_attraction_or_eatery(
    payload: dict,
    trip_id: str,
    order_number: str,
    source_email_id: str,
    linked_entities: list[dict],
    hierarchy_cities: list[str],
    first_country: str | None,
    metadata: dict,
) -> None:
    """Handle attraction or eatery create/update."""
    cat = metadata.get("category", "attraction")
    is_attraction = cat == "attraction"
    details = payload.get("attraction_details") if is_attraction else payload.get("eatery_details")
    if not details:
        return

    loc = details.get("location_details") or {}
    cost = details.get("cost") if is_attraction else None
    name = details.get("attraction_name") if is_attraction else details.get("establishment_name")
    city = loc.get("city") or (hierarchy_cities[0] if hierarchy_cities else None)
    country = loc.get("country") or first_country

    new_data = {
        "category": cat,
        "place_type": details.get("attraction_type") if is_attraction else "restaurant",
            "activity_type": details.get("attraction_type") if is_attraction else "dining",
        "name": name or "Activity",
        "status": "booked",
        "is_cancelled": False,
        "location": {"address": loc.get("street"), "city": city, "country": country},
        "details": {
            "cost": {"amount": cost["amount"], "currency": cost["currency"]} if cost else None,
            "order_number": order_number,
            "free_cancellation_until": details.get("free_cancellation_until"),
            "booking": {
                "reservation_date": details.get("reservation_date"),
                "reservation_hour": details.get("reservation_hour"),
            },
        },
    }

    existing = find_existing_poi(trip_id, order_number, cat)
    if not existing:
        existing = find_existing_poi_by_name_and_location(trip_id, name or "", cat, city)

    if existing:
        merged = {
            **new_data,
            "location": merge_with_new_wins(existing.get("location"), new_data["location"]),
            "details": merge_with_new_wins(existing.get("details"), new_data["details"]),
            "source_refs": add_email_to_source_refs(existing.get("source_refs"), source_email_id),
        }
        if not name:
            merged["name"] = existing.get("name", "Activity")

        db.update("points_of_interest", {"id": existing["id"]}, merged)
        linked_entities.append({
            "entity_type": "poi",
            "entity_id": existing["id"],
            "description": f"{cat} (updated)",
        })

        # Fire-and-forget enrich if missing coords or image
        if not (existing.get("location") or {}).get("coordinates", {}).get("lat") or not existing.get("image_url"):
            _enrich_fire_and_forget(
                existing["id"],
                merged.get("name") or existing.get("name", ""),
                city=merged.get("location", {}).get("city", ""),
                country=merged.get("location", {}).get("country", ""),
                address=merged.get("location", {}).get("address", ""),
            )
    else:
        rows = db.insert("points_of_interest", {
            "trip_id": trip_id,
            **new_data,
            "is_paid": metadata.get("is_paid", False),
            "source_refs": {"email_ids": [source_email_id], "recommendation_ids": []},
        }, select="id")

        if rows:
            poi_id = rows[0]["id"]
            linked_entities.append({
                "entity_type": "poi",
                "entity_id": poi_id,
                "description": "Attraction" if is_attraction else "Eatery",
            })
            _enrich_fire_and_forget(
                poi_id, new_data["name"],
                city=new_data["location"].get("city", ""),
                country=new_data["location"].get("country", ""),
                address=new_data["location"].get("address", ""),
            )
