"""Process recommendation webhook payloads (Python port).

Replaces the Supabase Edge Function ``recommendation-webhook/index.ts``.
Called directly from the worker Lambda after AI analysis + reconciliation,
instead of sending an HTTP request to the Edge Function.

Uses:
  - core.supabase_db  for all DB operations
  - core.enrich_poi   for fire-and-forget POI enrichment
  - core.map_utils    for fuzzy_match, build_site_to_country_map, build_site_to_city_map
  - core.config       for loading type/category mappings from config.json
"""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.parse
import urllib.request
from typing import Any

from core.map_utils import (
    build_site_to_city_map,
    build_site_to_country_map,
    fuzzy_match,
)
from core.supabase_db import (
    insert,
    query,
    update,
    validate_webhook_token,
)
from core.enrich_poi import enrich_poi

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config-driven category / type sets
# ---------------------------------------------------------------------------

def _load_category_maps() -> tuple[dict[str, str], set[str], set[str]]:
    """Load TYPE_TO_CATEGORY, GEO_TYPES, and TIP_TYPES from config.json.

    Mirrors the logic in ``frontend/scripts/generate-categories.mjs``:
      - TYPE_TO_CATEGORY: ``type`` -> ``db_name`` for each master_list entry
        whose config category has a non-null ``db_name``.
      - GEO_TYPES: entries where ``is_geo_location`` is true.
      - TIP_TYPES: entries whose ``category`` is ``"Tips"``.
    """
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "config.json",
    )
    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)

    master_list = config_data.get("master_list", [])
    categories_meta = config_data.get("categories", {})

    # category name (e.g. "Activities") -> db_name (e.g. "attraction")
    cat_to_db: dict[str, str] = {}
    for cat_name, meta in categories_meta.items():
        if meta.get("db_name"):
            cat_to_db[cat_name] = meta["db_name"]

    type_to_category: dict[str, str] = {}
    geo_types: set[str] = set()
    tip_types: set[str] = set()

    for entry in master_list:
        t = entry.get("type", "")
        # TYPE_TO_CATEGORY
        db_name = cat_to_db.get(entry.get("category", ""))
        if db_name:
            type_to_category[t] = db_name
        # GEO_TYPES
        if entry.get("is_geo_location"):
            geo_types.add(t)
        # TIP_TYPES
        if entry.get("category") == "Tips":
            tip_types.add(t)

    return type_to_category, geo_types, tip_types


TYPE_TO_CATEGORY, GEO_TYPES, TIP_TYPES = _load_category_maps()

# Role mapping for contacts (same as TypeScript)
_ROLE_MAP = {
    "guide": "guide",
    "host": "host",
    "rental": "rental",
    "restaurant": "restaurant",
    "driver": "driver",
    "agency": "agency",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _merge_with_new_wins(old: Any, incoming: Any) -> Any:
    """Merge two values: new wins when both have a value.

    Mirrors ``_shared/merge.ts  mergeWithNewWins``.
    """
    if incoming is None or incoming == "":
        return old
    if not isinstance(incoming, dict) or isinstance(incoming, list):
        return incoming
    if not isinstance(old, dict) or old is None:
        return incoming
    result = {**old}
    for key in incoming:
        result[key] = _merge_with_new_wins(old.get(key), incoming[key])
    return result


def _sync_sites_hierarchy_to_trip_locations(
    trip_id: str,
    hierarchy: list[dict],
) -> None:
    """Walk the sites_hierarchy tree and insert missing nodes into trip_locations.

    Mirrors ``syncSitesHierarchyToTripLocations`` in the TypeScript source.
    """
    existing = query(
        "trip_locations",
        filters={"trip_id": trip_id},
        select="id,name,parent_id",
    )

    # Lowercase name -> id lookup
    name_to_id: dict[str, str] = {}
    for loc in existing or []:
        name_to_id[loc["name"].lower()] = loc["id"]

    def walk_and_insert(nodes: list[dict], parent_id: str | None) -> None:
        for node in nodes:
            key = node["site"].lower()
            node_id = name_to_id.get(key)

            if not node_id:
                rows = insert(
                    "trip_locations",
                    {
                        "trip_id": trip_id,
                        "parent_id": parent_id,
                        "name": node["site"],
                        "site_type": node.get("site_type", ""),
                        "source": "webhook",
                    },
                    select="id",
                )
                if rows:
                    node_id = rows[0]["id"]
                    name_to_id[key] = node_id

            if node_id and node.get("sub_sites"):
                walk_and_insert(node["sub_sites"], node_id)

    walk_and_insert(hierarchy, None)


def _send_notification(
    trip_id: str,
    source_rec_id: str,
    new_count: int,
    source_title: str,
) -> None:
    """Fire-and-forget: push + WhatsApp notifications to trip members.

    Calls Supabase Edge Functions ``send-notification`` and ``whatsapp-notify``.
    """
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not service_key:
        return

    members = query(
        "trip_members",
        filters={"trip_id": trip_id},
        select="user_id",
    )
    if not members:
        return

    user_ids = [m["user_id"] for m in members]
    plural = "" if new_count == 1 else "s"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {service_key}",
    }

    # Push notification
    try:
        push_body = json.dumps({
            "user_ids": user_ids,
            "title": "Recommendation ready",
            "body": f'{new_count} new item{plural} from "{source_title}"',
            "url": "/recommendations",
            "tag": f"rec-{source_rec_id}",
        }).encode("utf-8")
        push_url = f"{supabase_url}/functions/v1/send-notification"
        req = urllib.request.Request(push_url, data=push_body, headers=headers, method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        logger.warning("Push notification failed: %s", e)

    # WhatsApp notification
    try:
        wa_body = json.dumps({
            "user_ids": user_ids,
            "type": "recommendation_ready",
            "text": f'\u2705 {new_count} new item{plural} from "{source_title}" added to your trip!',
            "template_name": "recommendation_ready",
            "template_params": [source_title, str(new_count)],
        }).encode("utf-8")
        wa_url = f"{supabase_url}/functions/v1/whatsapp-notify"
        req = urllib.request.Request(wa_url, data=wa_body, headers=headers, method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        logger.warning("WhatsApp notification failed: %s", e)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process_recommendation_failure(
    payload: dict,
    webhook_token: str | None = None,
) -> dict:
    """Handle a failed recommendation (store error in DB).

    Called when worker AI analysis fails.

    Args:
        payload: Must contain ``recommendation_id``; may contain ``error``,
            ``source_url``, ``source_title``, ``source_image``.
        webhook_token: The user's webhook token (for user scoping / validation).

    Returns:
        dict with ``success``, ``action``, ``recommendation_id``.
    """
    # Validate token if provided
    if webhook_token:
        result = validate_webhook_token(webhook_token)
        if not result:
            return {"success": False, "error": "Invalid webhook token"}

    rec_id = payload.get("recommendation_id", "")

    # Check for existing row
    existing = query(
        "source_recommendations",
        filters={"recommendation_id": rec_id},
        select="id,status",
        single=True,
    )

    error_msg = payload.get("error", "Unknown error")

    if existing:
        update(
            "source_recommendations",
            filters={"id": existing["id"]},
            data={
                "status": "failed",
                "error": error_msg,
                **({"source_title": payload["source_title"]} if payload.get("source_title") else {}),
                **({"source_image": payload["source_image"]} if payload.get("source_image") else {}),
            },
        )
        return {
            "success": True,
            "action": "marked_failed",
            "recommendation_id": rec_id,
        }

    # No existing row — insert a failed row for visibility
    insert(
        "source_recommendations",
        {
            "recommendation_id": rec_id,
            "source_url": payload.get("source_url", ""),
            "source_title": payload.get("source_title") or None,
            "source_image": payload.get("source_image") or None,
            "status": "failed",
            "error": error_msg,
            "analysis": {},
            "linked_entities": [],
        },
    )
    return {
        "success": True,
        "action": "inserted_failed",
        "recommendation_id": rec_id,
    }


def process_recommendation(
    payload: dict,
    webhook_token: str | None = None,
) -> dict:
    """Process an AI recommendation webhook payload.

    This replaces the Supabase Edge Function recommendation-webhook.
    Called directly from worker after AI analysis + reconciliation.

    Args:
        payload: The full webhook payload (input_type, analysis with
            recommendations + sites_hierarchy, source_url, etc.)
        webhook_token: The user's webhook token (for user scoping).

    Returns:
        dict with: success, source_recommendation_id, matched, trip_id,
        linked_entities, new_count.
    """
    # ── Resolve user from token ──────────────────────────────────
    user_id: str | None = None
    if webhook_token:
        result = validate_webhook_token(webhook_token)
        if result and result.get("valid"):
            user_id = result["user_id"]
        else:
            return {"success": False, "error": "Invalid webhook token"}

    logger.info("Received recommendation payload, userId: %s", user_id)

    rec_id = payload.get("recommendation_id", "")

    # ── Handle failure status ────────────────────────────────────
    if payload.get("status") == "failed":
        return process_recommendation_failure(payload, webhook_token)

    # ── Idempotency check ────────────────────────────────────────
    existing = query(
        "source_recommendations",
        filters={"recommendation_id": rec_id},
        select="id,status",
        single=True,
    )

    if existing and existing.get("status") != "processing":
        return {
            "success": True,
            "action": "duplicate_skipped",
            "recommendation_id": rec_id,
        }

    is_upsert = existing and existing.get("status") == "processing"
    existing_id = existing["id"] if existing else None

    # ── Trip matching by country overlap ─────────────────────────
    matched_trip_id: str | None = None
    analysis = payload.get("analysis", {})
    sites_hierarchy = analysis.get("sites_hierarchy") or []

    country_sites = [
        s for s in sites_hierarchy if s.get("site_type") == "country"
    ]

    if country_sites:
        trips: list[dict] = []
        if user_id:
            member_rows = query(
                "trip_members",
                filters={"user_id": user_id},
                select="trip_id,trips(id,countries)",
            )
            trips = [
                r["trips"]
                for r in (member_rows or [])
                if r.get("trips")
            ]
        else:
            trips = query("trips", filters={}, select="id,countries") or []

        for trip in trips:
            trip_countries = [
                c.lower() for c in (trip.get("countries") or [])
            ]
            if any(
                s["site"].lower() in trip_countries for s in country_sites
            ):
                matched_trip_id = trip["id"]
                break

    logger.info(
        "Matched trip: %s, source_image: %s, upsert: %s",
        matched_trip_id or "none",
        "YES" if payload.get("source_image") else "NO",
        is_upsert,
    )

    # Embed source_text inside analysis JSON if present
    analysis_data = {**analysis}
    if payload.get("source_text"):
        analysis_data["source_text"] = payload["source_text"]

    status = "linked" if matched_trip_id else "pending"

    # ── Insert or update source_recommendation ───────────────────
    if is_upsert and existing_id:
        update(
            "source_recommendations",
            filters={"id": existing_id},
            data={
                "trip_id": matched_trip_id,
                "timestamp": payload.get("timestamp"),
                "source_url": payload.get("source_url", ""),
                "source_title": payload.get("source_title") or None,
                "source_image": payload.get("source_image") or None,
                "analysis": analysis_data,
                "status": status,
                "linked_entities": [],
            },
        )
        source_rec_id = existing_id
    else:
        rows = insert(
            "source_recommendations",
            {
                "recommendation_id": rec_id,
                "trip_id": matched_trip_id,
                "timestamp": payload.get("timestamp"),
                "source_url": payload.get("source_url", ""),
                "source_title": payload.get("source_title") or None,
                "source_image": payload.get("source_image") or None,
                "analysis": analysis_data,
                "status": status,
                "linked_entities": [],
            },
            select="id",
        )
        if not rows:
            return {"success": False, "error": "Failed to insert source_recommendation"}
        source_rec_id = rows[0]["id"]

    # ── Process items if matched to a trip ───────────────────────
    linked_entities: list[dict] = []

    if matched_trip_id:
        linked_entities = _process_trip_entities(
            matched_trip_id,
            source_rec_id,
            payload,
            analysis,
            sites_hierarchy,
        )

        # Update source_recommendation with linked entities
        if linked_entities:
            update(
                "source_recommendations",
                filters={"id": source_rec_id},
                data={"linked_entities": linked_entities},
            )

        # Fire-and-forget: notifications
        new_count = sum(1 for e in linked_entities if not e.get("matched_existing"))
        source_title = payload.get("source_title") or payload.get("source_url") or "a link"
        threading.Thread(
            target=_send_notification,
            args=(matched_trip_id, source_rec_id, new_count, source_title),
            daemon=True,
        ).start()

    new_entities = [e for e in linked_entities if not e.get("matched_existing")]
    matched_existing = [e for e in linked_entities if e.get("matched_existing")]

    return {
        "success": True,
        "source_recommendation_id": source_rec_id,
        "matched": bool(matched_trip_id),
        "trip_id": matched_trip_id,
        "linked_entities": linked_entities,
        "created_entities": len(new_entities),
        "matched_entities": len(matched_existing),
        "status": status,
    }


# ---------------------------------------------------------------------------
# Internal: entity processing
# ---------------------------------------------------------------------------

def _process_trip_entities(
    trip_id: str,
    source_rec_id: str,
    payload: dict,
    analysis: dict,
    sites_hierarchy: list[dict],
) -> list[dict]:
    """Process recommendations, contacts, and sites_hierarchy for a matched trip.

    Returns the linked_entities list.
    """
    linked_entities: list[dict] = []

    # Pre-fetch existing entities for this trip
    existing_pois = query(
        "points_of_interest",
        filters={"trip_id": trip_id},
        select="id,name,category,location,source_refs,image_url",
    ) or []
    existing_transport = query(
        "transportation",
        filters={"trip_id": trip_id},
        select="id,category,additional_info,source_refs",
    ) or []
    existing_contacts = query(
        "contacts",
        filters={"trip_id": trip_id},
        select="id,name,role",
    ) or []

    items = analysis.get("recommendations") or []
    site_to_country = build_site_to_country_map(sites_hierarchy)
    site_to_city = build_site_to_city_map(sites_hierarchy)

    logger.info("[debug] Processing %d items", len(items))

    # ── Process recommendation items ─────────────────────────────
    for item in items:
        item_type = item.get("category", "")
        item_name = item.get("name", "")
        logger.debug('[debug] Item: "%s", type: "%s"', item_name, item_type)

        # Skip geo, tip, and bad-sentiment items
        if item_type in GEO_TYPES or item_type in TIP_TYPES or item.get("sentiment") == "bad":
            logger.debug("[debug] Skipped (geo/tip/bad): %s", item_type)
            continue

        db_category = TYPE_TO_CATEGORY.get(item_type)
        if not db_category:
            logger.debug('[debug] Skipped (no mapping for "%s")', item_type)
            continue

        if db_category == "transportation":
            _process_transportation_item(
                item, item_name, trip_id, source_rec_id,
                existing_transport, linked_entities,
            )
        else:
            _process_poi_item(
                item, item_name, item_type, db_category,
                trip_id, source_rec_id, payload,
                existing_pois, site_to_country, site_to_city,
                linked_entities,
            )

    # ── Process contacts ─────────────────────────────────────────
    contacts = analysis.get("contacts") or []
    for contact in contacts:
        if not contact.get("name"):
            continue

        matched_contact = next(
            (c for c in existing_contacts if fuzzy_match(c.get("name"), contact["name"])),
            None,
        )

        if matched_contact:
            linked_entities.append({
                "entity_type": "contact",
                "entity_id": matched_contact["id"],
                "description": contact["name"],
                "matched_existing": True,
            })
        else:
            role = _ROLE_MAP.get(contact.get("role", ""), "other")
            rows = insert(
                "contacts",
                {
                    "trip_id": trip_id,
                    "name": contact["name"],
                    "role": role,
                    "phone": contact.get("phone") or None,
                    "email": contact.get("email") or None,
                    "website": contact.get("website") or None,
                    "notes": contact.get("paragraph") or None,
                },
                select="id",
            )
            if rows:
                linked_entities.append({
                    "entity_type": "contact",
                    "entity_id": rows[0]["id"],
                    "description": contact["name"],
                    "matched_existing": False,
                })

    # ── Sync sites_hierarchy to trip_locations ────────────────────
    if sites_hierarchy:
        try:
            _sync_sites_hierarchy_to_trip_locations(trip_id, sites_hierarchy)
        except Exception as e:
            logger.error("Failed to sync sites hierarchy to trip_locations: %s", e)

    return linked_entities


def _process_transportation_item(
    item: dict,
    item_name: str,
    trip_id: str,
    source_rec_id: str,
    existing_transport: list[dict],
    linked_entities: list[dict],
) -> None:
    """Handle a single transportation recommendation item."""
    item_type = item.get("category", "")

    # Fuzzy match against existing transportation
    matched = next(
        (
            t for t in existing_transport
            if (t.get("additional_info") or {}).get("name")
            and fuzzy_match(t["additional_info"]["name"], item_name)
        ),
        None,
    )

    if matched:
        refs = matched.get("source_refs") or {}
        rec_ids = refs.get("recommendation_ids") or []
        if source_rec_id not in rec_ids:
            update(
                "transportation",
                filters={"id": matched["id"]},
                data={
                    "source_refs": {
                        **refs,
                        "recommendation_ids": [*rec_ids, source_rec_id],
                    }
                },
            )
        linked_entities.append({
            "entity_type": "transportation",
            "entity_id": matched["id"],
            "description": item_name,
            "matched_existing": True,
        })
    else:
        rows = insert(
            "transportation",
            {
                "trip_id": trip_id,
                "category": item_type,
                "status": "suggested",
                "is_paid": False,
                "source_refs": {
                    "email_ids": [],
                    "recommendation_ids": [source_rec_id],
                },
                "cost": {"total_amount": 0, "currency": "USD"},
                "booking": {},
                "segments": [],
                "additional_info": {
                    "name": item_name,
                    "from_recommendation": True,
                    "paragraph": item.get("paragraph"),
                    "site": item.get("site"),
                },
            },
            select="id",
        )
        if rows:
            linked_entities.append({
                "entity_type": "transportation",
                "entity_id": rows[0]["id"],
                "description": item_name,
                "matched_existing": False,
            })


def _process_poi_item(
    item: dict,
    item_name: str,
    item_type: str,
    poi_category: str,
    trip_id: str,
    source_rec_id: str,
    payload: dict,
    existing_pois: list[dict],
    site_to_country: dict[str, str],
    site_to_city: dict[str, str],
    linked_entities: list[dict],
) -> None:
    """Handle a single POI recommendation item (attraction, eatery, accommodation, service, event)."""
    item_site_key = (item.get("site") or "").lower()
    resolved_city = site_to_city.get(item_site_key) or item.get("site")
    resolved_country = site_to_country.get(item_site_key)

    # Fuzzy match: name + category, with optional city check
    matched_poi = None
    for p in existing_pois:
        if p.get("category") != poi_category:
            continue
        if not fuzzy_match(p.get("name"), item_name):
            continue
        existing_city = (p.get("location") or {}).get("city")
        new_city = resolved_city or (item.get("location") or {}).get("city")
        if existing_city and new_city and not fuzzy_match(existing_city, new_city):
            continue
        matched_poi = p
        break

    if matched_poi:
        # Link to existing — add recommendation ref and merge location data
        refs = matched_poi.get("source_refs") or {}
        rec_ids = refs.get("recommendation_ids") or []
        if source_rec_id not in rec_ids:
            incoming_location = {
                k: v
                for k, v in {
                    "country": resolved_country,
                    "city": resolved_city,
                    "address": (item.get("location") or {}).get("address"),
                    "coordinates": (item.get("location") or {}).get("coordinates"),
                }.items()
                if v is not None
            }
            merged_location = _merge_with_new_wins(
                matched_poi.get("location"), incoming_location
            )
            update_fields: dict[str, Any] = {
                "source_refs": {
                    **refs,
                    "recommendation_ids": [*rec_ids, source_rec_id],
                },
                "location": merged_location,
            }
            # Set image if existing POI doesn't have one
            item_image = item.get("image_url") or payload.get("source_image")
            if not matched_poi.get("image_url") and item_image:
                update_fields["image_url"] = item_image
                logger.info("[image] Setting image_url on POI %s", matched_poi["id"])

            update(
                "points_of_interest",
                filters={"id": matched_poi["id"]},
                data=update_fields,
            )

        linked_entities.append({
            "entity_type": "poi",
            "entity_id": matched_poi["id"],
            "description": item_name,
            "matched_existing": True,
        })
    else:
        # Create new POI
        logger.info('[debug] Creating new POI: "%s", category: "%s"', item_name, poi_category)
        rows = insert(
            "points_of_interest",
            {
                "trip_id": trip_id,
                "category": poi_category,
                "sub_category": item_type,
                "name": item_name,
                "status": "suggested",
                "is_paid": False,
                "location": {
                    "country": resolved_country,
                    "city": resolved_city,
                    "address": (item.get("location") or {}).get("address"),
                    "coordinates": (item.get("location") or {}).get("coordinates"),
                },
                "source_refs": {
                    "email_ids": [],
                    "recommendation_ids": [source_rec_id],
                },
                "details": {
                    "from_recommendation": True,
                    "paragraph": item.get("paragraph"),
                    "source_url": payload.get("source_url"),
                },
                "image_url": item.get("image_url") or payload.get("source_image") or None,
            },
            select="id",
        )
        if not rows:
            logger.error("[debug] POI insert failed for %s", item_name)
            return

        new_poi_id = rows[0]["id"]
        logger.info("[debug] Created POI %s", new_poi_id)

        linked_entities.append({
            "entity_type": "poi",
            "entity_id": new_poi_id,
            "description": item_name,
            "matched_existing": False,
        })

        # Assign to itinerary day if the recommendation has day info
        if item.get("day") is not None:
            _assign_poi_to_day(trip_id, new_poi_id, item)

        # Fire-and-forget: enrich POI with coordinates + image if missing
        if not item.get("image_url") or not (item.get("location") or {}).get(
            "coordinates", {}
        ).get("lat"):
            country = site_to_country.get(item_site_key, "")
            city = site_to_city.get(item_site_key, "")
            threading.Thread(
                target=_safe_enrich_poi,
                args=(new_poi_id, item_name, city, country, (item.get("location") or {}).get("address", "")),
                daemon=True,
            ).start()


def _assign_poi_to_day(trip_id: str, poi_id: str, item: dict) -> None:
    """Assign a newly created POI to an itinerary day."""
    try:
        day_number = item["day"]
        existing_day = query(
            "itinerary_days",
            filters={"trip_id": trip_id, "day_number": day_number},
            select="id,activities",
            single=True,
        )

        if existing_day:
            day_id = existing_day["id"]
            current_activities = existing_day.get("activities") or []
        else:
            rows = insert(
                "itinerary_days",
                {"trip_id": trip_id, "day_number": day_number},
                select="id",
            )
            if not rows:
                logger.error("[itinerary] Failed to create itinerary day %s", day_number)
                return
            day_id = rows[0]["id"]
            current_activities = []

        # Add POI as potential activity if not already there
        already = any(
            a.get("type") == "poi" and a.get("id") == poi_id
            for a in current_activities
        )
        if not already:
            current_activities.append({
                "id": poi_id,
                "type": "poi",
                "order": item.get("order") if item.get("order") is not None else len(current_activities) + 1,
                "schedule_state": "potential",
            })
            update(
                "itinerary_days",
                filters={"id": day_id},
                data={"activities": current_activities},
            )
            logger.info(
                "[itinerary] Assigned POI %s to day %s, order %s",
                poi_id, day_number, item.get("order"),
            )
    except Exception as e:
        logger.error("[itinerary] Failed to assign POI to day %s: %s", item.get("day"), e)


def _safe_enrich_poi(
    poi_id: str,
    name: str,
    city: str,
    country: str,
    address: str,
) -> None:
    """Wrapper for enrich_poi that catches exceptions (for fire-and-forget threads)."""
    try:
        enrich_poi(poi_id, name, city=city, country=country, address=address)
    except Exception as e:
        logger.warning('[enrich] Failed for "%s": %s', name, e)
