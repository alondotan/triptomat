"""POI enrichment: geocode + image + DB update.

Ports the TypeScript Edge Function logic from:
  - _shared/enrichPoi.ts  (orchestrator)
  - _shared/geocode.ts    (Google Geocoding + Places API)
  - _shared/pexels.ts     (Pexels image search)

Uses urllib.request for HTTP calls (consistent with supabase_client.py).
Env vars: GOOGLE_MAPS_API_KEY, PEXELS_API_KEY.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from core.supabase_db import query, update

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
PEXELS_API_KEY = os.environ.get("PEXELS_API_KEY", "")

_TIMEOUT = 10  # seconds


# ---------------------------------------------------------------------------
# Geocoding (Google Geocoding API)
# ---------------------------------------------------------------------------

def geocode_address(query_str: str) -> dict:
    """Google Geocoding API.

    Returns {"coordinates": {"lat": float, "lng": float},
             "formatted_address": str}
    or      {"coordinates": None, "formatted_address": None}.
    """
    if not GOOGLE_MAPS_API_KEY:
        print("[geocode] GOOGLE_MAPS_API_KEY not configured")
        return {"coordinates": None, "formatted_address": None}

    url = (
        "https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={urllib.parse.quote_plus(query_str)}"
        f"&key={GOOGLE_MAPS_API_KEY}"
    )

    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:
            data = json.loads(res.read().decode("utf-8"))

        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            loc = result.get("geometry", {}).get("location", {})
            if loc.get("lat") and loc.get("lng"):
                return {
                    "coordinates": {"lat": loc["lat"], "lng": loc["lng"]},
                    "formatted_address": result.get("formatted_address"),
                }
    except Exception as e:
        print(f"[geocode] Geocoding API error: {e}")

    return {"coordinates": None, "formatted_address": None}


# ---------------------------------------------------------------------------
# Google Places image
# ---------------------------------------------------------------------------

def fetch_place_image(name: str, lat: float, lng: float) -> str | None:
    """Google Places API (New) textSearch with location bias.

    Returns a photo URL or None.
    """
    if not GOOGLE_MAPS_API_KEY:
        return None

    search_url = "https://places.googleapis.com/v1/places:searchText"
    payload = json.dumps({
        "textQuery": name,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 500.0,
            }
        },
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "places.photos,places.id",
    }

    try:
        req = urllib.request.Request(search_url, data=payload, headers=headers)
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:
            data = json.loads(res.read().decode("utf-8"))

        places = data.get("places") or []
        if places:
            photos = places[0].get("photos") or []
            if photos:
                photo_name = photos[0].get("name")
                if photo_name:
                    return (
                        f"https://places.googleapis.com/v1/{photo_name}/media"
                        f"?maxHeightPx=800&maxWidthPx=800&key={GOOGLE_MAPS_API_KEY}"
                    )
    except Exception as e:
        print(f"[geocode] Places API error: {e}")

    return None


# ---------------------------------------------------------------------------
# Pexels image
# ---------------------------------------------------------------------------

def fetch_pexels_image(name: str, country: str = "") -> str | None:
    """Pexels API search. Returns a landscape image URL or None."""
    if not PEXELS_API_KEY:
        print("[pexels] PEXELS_API_KEY not configured")
        return None

    search_query = f"{name} {country}".strip() if country else name
    url = (
        "https://api.pexels.com/v1/search"
        f"?query={urllib.parse.quote_plus(search_query)}"
        "&per_page=1&orientation=landscape"
    )

    try:
        req = urllib.request.Request(url, headers={"Authorization": PEXELS_API_KEY})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:
            data = json.loads(res.read().decode("utf-8"))

        photos = data.get("photos") or []
        if photos:
            return photos[0].get("src", {}).get("landscape") or None
    except Exception as e:
        print(f"[pexels] API error: {e}")

    return None


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def enrich_poi(
    poi_id: str,
    name: str,
    city: str = "",
    country: str = "",
    address: str = "",
) -> dict:
    """Enrich a POI with coordinates and image.

    1. Read current POI to check what's missing.
    2. Geocode if no coordinates.
    3. Fetch image: try Google Places first, fallback to Pexels.
    4. Update DB with new data.

    Returns {"coordinates": {...} | None, "image_url": str | None}.
    """
    # Read current POI state
    poi = query(
        "points_of_interest",
        filters={"id": poi_id},
        select="location,image_url",
        single=True,
    )

    if not poi:
        print(f"[enrichPoi] Failed to read POI {poi_id}")
        return {"coordinates": None, "image_url": None}

    location = poi.get("location") or {}
    existing_coords = location.get("coordinates") or {}
    has_coords = bool(existing_coords.get("lat") and existing_coords.get("lng"))
    has_image = bool(poi.get("image_url"))

    # Already fully enriched
    if has_coords and has_image:
        return {"coordinates": existing_coords, "image_url": poi["image_url"]}

    coordinates = existing_coords if has_coords else None
    image_url: str | None = poi.get("image_url") if has_image else None

    # Step 1: Geocode if missing coordinates
    if not has_coords:
        parts = [p for p in (name, address, city, country) if p]
        query_str = ", ".join(parts)
        print(f'[enrichPoi] Geocoding: "{query_str}"')

        geo = geocode_address(query_str)
        if geo["coordinates"]:
            coordinates = geo["coordinates"]

            # Merge with existing location object
            updated_location = {**location, "coordinates": geo["coordinates"]}
            if geo.get("formatted_address") and not location.get("address"):
                updated_location["address"] = geo["formatted_address"]

            update(
                "points_of_interest",
                filters={"id": poi_id},
                data={"location": updated_location},
            )
            print(
                f"[enrichPoi] Coordinates set for {poi_id}: "
                f"{geo['coordinates']['lat']},{geo['coordinates']['lng']}"
            )

    # Step 2: Fetch image if missing
    if not has_image:
        # Try Google Places first (needs coordinates)
        if coordinates and coordinates.get("lat") and coordinates.get("lng"):
            image_url = fetch_place_image(
                name, coordinates["lat"], coordinates["lng"]
            )
            if image_url:
                update(
                    "points_of_interest",
                    filters={"id": poi_id},
                    data={"image_url": image_url},
                    extra_filter="image_url=is.null",
                )
                print(f"[enrichPoi] Google Places image set for {poi_id}")

        # Fallback to Pexels
        if not image_url:
            image_url = fetch_pexels_image(name, country)
            if image_url:
                update(
                    "points_of_interest",
                    filters={"id": poi_id},
                    data={"image_url": image_url},
                    extra_filter="image_url=is.null",
                )
                print(f"[enrichPoi] Pexels image set for {poi_id}")

    return {"coordinates": coordinates, "image_url": image_url}
