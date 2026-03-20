"""Reconciliation module: refines AI output against existing trip data.

Handles two input formats:
  - Worker format: { sites_hierarchy, recommendations, contacts }
  - Mail-handler format: { metadata, sites_hierarchy, accommodation_details, ... }

The reconciliation normalizes names, flags duplicates, and flags items
outside the trip's geographic scope. Items are NOT removed — only annotated.
"""

import json
import os
import urllib.request
import urllib.error
from typing import Optional

from core.supabase_client import fetch_trip_context


# ── Format detection ──────────────────────────────────────────────


def _detect_format(data: dict) -> str:
    """Detect whether data is worker format or mail-handler format."""
    if "recommendations" in data:
        return "worker"
    if "metadata" in data:
        return "mail_handler"
    return "unknown"


# ── Country extraction from sites_hierarchy ───────────────────────


def _extract_countries_from_hierarchy(data: dict) -> list[str]:
    """Extract country names from the sites_hierarchy in the data."""
    countries = []
    hierarchy = data.get("sites_hierarchy", [])

    def walk(nodes):
        for node in nodes:
            if isinstance(node, dict):
                if node.get("site_type") == "country":
                    countries.append(node.get("site", ""))
                walk(node.get("sub_sites", []))

    walk(hierarchy)
    return countries


# ── Build reconciliation prompts ──────────────────────────────────


def _build_worker_prompt(data: dict, trip_context: dict) -> str:
    """Build reconciliation prompt for worker (recommendations) format."""
    existing_pois = json.dumps([
        {"name": p["name"], "category": p.get("category"),
         "sub_category": p.get("sub_category"),
         "city": (p.get("location") or {}).get("city")}
        for p in trip_context["existing_pois"]
    ], ensure_ascii=False)

    existing_contacts = json.dumps([
        {"name": c["name"], "role": c.get("role")}
        for c in trip_context["existing_contacts"]
    ], ensure_ascii=False)

    trip_countries = json.dumps(trip_context["countries"], ensure_ascii=False)
    new_recs = json.dumps(data.get("recommendations", []), ensure_ascii=False)
    new_contacts = json.dumps(data.get("contacts", []), ensure_ascii=False)
    new_hierarchy = json.dumps(data.get("sites_hierarchy", []), ensure_ascii=False)

    # Extract unique city names from existing POIs for hierarchy normalization
    existing_cities = sorted(set(
        (p.get("location") or {}).get("city", "")
        for p in trip_context["existing_pois"]
        if (p.get("location") or {}).get("city")
    ))
    existing_cities_json = json.dumps(existing_cities, ensure_ascii=False)

    return f"""You are a data reconciliation agent for a travel planning app.

TASK: Compare NEW recommendations against EXISTING trip data and refine the output.

TRIP CONTEXT:
- Trip countries: {trip_countries}
- Trip dates: {trip_context.get("start_date")} to {trip_context.get("end_date")}
- City names already used in the trip: {existing_cities_json}

EXISTING POIs in the trip:
{existing_pois}

EXISTING Contacts in the trip:
{existing_contacts}

NEW SITES HIERARCHY to reconcile:
{new_hierarchy}

NEW RECOMMENDATIONS to reconcile:
{new_recs}

NEW CONTACTS to reconcile:
{new_contacts}

RULES:
1. INTERNAL DEDUP: If two or more NEW recommendations refer to the same place (e.g. listed twice with slightly different names), keep only ONE and merge their information. Mark kept item with "merged_from": [list of original names that were merged]. This is the most important rule.
2. NAME NORMALIZATION against existing data: If a new item clearly refers to the same place as an EXISTING POI (e.g. "Anne Frank House" vs "Anne Frank's House", "Rijksmuseum Amsterdam" vs "Rijksmuseum"), change the new item's "name" to match the existing entry EXACTLY. This ensures our system's merge logic will correctly link them. Do NOT remove these items.
3. GEOGRAPHIC FILTERING: If a recommendation is in a country NOT in the trip countries list, add "is_outside_trip": true to that item. Otherwise set it to false.
4. SITE HIERARCHY NORMALIZATION: Normalize city/region names in the sites_hierarchy AND in each recommendation's "site" field to match the city names already used in the trip. For example if existing cities include "Amsterdam" but the new data says "Amsterdam, North Holland" or "Amsterdam Centrum", normalize to "Amsterdam". Same for country names — use the exact spelling from the trip countries list.
5. INTERNAL CONTACT DEDUP: If two or more NEW contacts refer to the same person, keep only one.
6. CONTACT NAME NORMALIZATION: If a new contact matches an existing contact by name (fuzzy), normalize the name to match the existing one exactly.
7. Keep ALL original fields intact on every kept item. Only ADD the reconciliation fields.

Return a JSON object with:
{{"sites_hierarchy": [...], "recommendations": [...], "contacts": [...]}}

The sites_hierarchy must use the normalized city/country names.
Each item must include all its original fields PLUS any reconciliation fields added.
Only output valid JSON, no explanations."""


def _build_mail_handler_prompt(data: dict, trip_context: dict) -> str:
    """Build reconciliation prompt for mail-handler (email) format."""
    existing_pois = json.dumps([
        {"name": p["name"], "category": p.get("category"),
         "sub_category": p.get("sub_category"),
         "city": (p.get("location") or {}).get("city")}
        for p in trip_context["existing_pois"]
    ], ensure_ascii=False)

    existing_transport = json.dumps([
        {"category": t.get("category"),
         "order_number": (t.get("booking") or {}).get("order_number"),
         "name": (t.get("additional_info") or {}).get("name")}
        for t in trip_context["existing_transport"]
    ], ensure_ascii=False)

    trip_countries = json.dumps(trip_context["countries"], ensure_ascii=False)

    # Build a summary of the incoming entity
    category = data.get("metadata", {}).get("category", "unknown")
    detail_keys = {
        "accommodation": "accommodation_details",
        "transportation": "transportation_details",
        "eatery": "eatery_details",
        "attraction": "attraction_details",
    }
    detail_key = detail_keys.get(category, "")
    entity_details = json.dumps(data.get(detail_key, {}), ensure_ascii=False) if detail_key else "{}"
    order_number = data.get("metadata", {}).get("order_number", "")

    return f"""You are a data reconciliation agent for a travel planning app.

TASK: Compare a NEW email-extracted entity against EXISTING trip data.

TRIP CONTEXT:
- Trip countries: {trip_countries}
- Trip dates: {trip_context.get("start_date")} to {trip_context.get("end_date")}

EXISTING POIs in the trip:
{existing_pois}

EXISTING Transportation in the trip:
{existing_transport}

NEW ENTITY:
- Category: {category}
- Order number: {order_number}
- Details: {entity_details}

RULES:
1. Check if this entity already exists in the trip by name similarity or order number match.
2. If the entity's location is in a country NOT in {trip_countries}, flag it.
3. Normalize the establishment/attraction name to match existing entries if referring to the same place.
4. Return ONLY a JSON object with this structure:
{{
    "reconciliation": {{
        "is_duplicate": true/false,
        "existing_match": "<name of matched existing entry>" or null,
        "is_outside_trip": true/false,
        "normalized_name": "<corrected name or original if no change>"
    }}
}}

Only output valid JSON, no explanations."""


# ── Gemini API call via direct HTTP ───────────────────────────────


def _call_gemini_reconciliation(prompt: str, api_key: str) -> Optional[dict]:
    """Call Gemini 2.0 Flash via REST API for reconciliation."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        "models/gemini-2.0-flash:generateContent"
        f"?key={api_key}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            result = json.loads(res.read().decode("utf-8"))
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        print(f"Reconciliation Gemini API error: {e}")
        return None
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"Reconciliation Gemini response parse error: {e}")
        return None


# ── Merge reconciliation results ──────────────────────────────────


def _merge_worker_result(original: dict, reconciled: dict) -> dict:
    """Merge reconciliation results back into worker-format data.

    The AI has already:
    - Removed internal duplicates (kept one, merged info)
    - Normalized names to match existing POIs (so edge function merge works)
    - Flagged items outside trip geography

    This function additionally removes items flagged as outside the trip.
    """
    if "sites_hierarchy" in reconciled:
        original["sites_hierarchy"] = reconciled["sites_hierarchy"]
    if "recommendations" in reconciled:
        all_recs = reconciled["recommendations"]
        kept = [r for r in all_recs if not r.get("is_outside_trip")]
        outside = len(all_recs) - len(kept)
        original_count = len(original.get("recommendations", []))
        if outside:
            print(f"Reconciliation: removed {outside} recommendation(s) outside trip area")
        if len(kept) != original_count:
            print(f"Reconciliation: {original_count} → {len(kept)} recommendations after dedup + geo filter")
        original["recommendations"] = kept
    if "contacts" in reconciled:
        original_count = len(original.get("contacts", []))
        new_count = len(reconciled["contacts"])
        if original_count != new_count:
            print(f"Reconciliation: {original_count} → {new_count} contacts (internal dedup)")
        original["contacts"] = reconciled["contacts"]
    return original


def _merge_mail_handler_result(original: dict, reconciled: dict) -> dict:
    """Merge reconciliation results back into mail-handler-format data."""
    recon = reconciled.get("reconciliation", {})
    original["reconciliation"] = recon

    # Apply name normalization to the relevant details block
    normalized = recon.get("normalized_name")
    if normalized:
        category = original.get("metadata", {}).get("category", "")
        name_fields = {
            "accommodation": ("accommodation_details", "establishment_name"),
            "eatery": ("eatery_details", "establishment_name"),
            "attraction": ("attraction_details", "attraction_name"),
        }
        if category in name_fields:
            block_key, field_key = name_fields[category]
            if block_key in original and original[block_key]:
                original[block_key][field_key] = normalized

    return original


# ── Main entry point ──────────────────────────────────────────────


def reconcile(
    data: dict,
    webhook_token: str,
    google_api_key: str,
    supabase_url: str = "",
    supabase_key: str = "",
) -> dict:
    """
    Reconcile AI analysis output against existing trip data.

    Args:
        data: The AI analysis output (worker or mail-handler format).
        webhook_token: User's webhook token for trip lookup.
        google_api_key: Gemini API key for the reconciliation AI call.
        supabase_url: Supabase project URL (falls back to env var).
        supabase_key: Supabase service role key (falls back to env var).

    Returns:
        The refined data dict. On any failure, returns original data unchanged.
    """
    if not supabase_url:
        supabase_url = os.environ.get("SUPABASE_URL", "")
    if not supabase_key:
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not webhook_token or not supabase_url or not supabase_key:
        print("Reconciliation skipped: missing webhook_token or Supabase credentials")
        return data

    if not google_api_key:
        print("Reconciliation skipped: missing Google API key")
        return data

    data_format = _detect_format(data)
    if data_format == "unknown":
        print("Reconciliation skipped: unrecognized data format")
        return data

    try:
        # 1. Extract countries from incoming data as hint for trip matching
        hint_countries = _extract_countries_from_hierarchy(data)

        # 2. Fetch trip context from Supabase
        trip_context = fetch_trip_context(
            webhook_token, supabase_url, supabase_key,
            hint_countries=hint_countries,
        )

        if not trip_context:
            print("Reconciliation skipped: no active trip found for token")
            return data

        # Inject resolved trip/user IDs so callers can use them
        data["_resolved_trip_id"] = trip_context.get("trip_id")
        data["_resolved_user_id"] = trip_context.get("user_id")

        # 3. Skip if nothing to compare against
        has_existing = (
            trip_context["existing_pois"]
            or trip_context["existing_transport"]
            or trip_context["existing_contacts"]
        )
        has_country_filter = bool(trip_context["countries"])

        if not has_existing and not has_country_filter:
            print("Reconciliation skipped: empty trip, nothing to reconcile against")
            return data

        # 4. Build prompt and call AI
        if data_format == "worker":
            prompt = _build_worker_prompt(data, trip_context)
        else:
            prompt = _build_mail_handler_prompt(data, trip_context)

        result = _call_gemini_reconciliation(prompt, google_api_key)

        if not result:
            print("Reconciliation: AI returned no result, using original data")
            return data

        # 5. Merge results back
        if data_format == "worker":
            data = _merge_worker_result(data, result)
        else:
            data = _merge_mail_handler_result(data, result)

        print(f"Reconciliation completed for {data_format} format")
        return data

    except Exception as e:
        print(f"Reconciliation failed (falling back to original): {e}")
        return data
