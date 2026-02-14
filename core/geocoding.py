import re


def get_site_hierarchy_string(site_name, sites_list):
    """Builds a parent chain for a specific site (e.g.: Jaffa, Tel Aviv, Israel)."""
    path = []
    current = site_name
    visited = set()

    while current and current not in visited:
        visited.add(current)
        path.append(current)
        parent = next((s.get('parent_site') for s in sites_list if s.get('site') == current), None)
        current = parent

    return ", ".join(path)


def extract_coords_from_url(url):
    """Extracts latitude and longitude from a Google Maps URL."""
    reg = r'@([-?\d\.]+),([-?\d\.]+)'
    match = re.search(reg, url)
    if match:
        return float(match.group(1)), float(match.group(2))
    return None, None


def enrich_analysis_data(json_obj, geocode_fn, manual_lat=None, manual_lng=None):
    """Scans recommendations and enriches geographic info using the site hierarchy.

    Args:
        json_obj: The analysis JSON object with recommendations and sites_list.
        geocode_fn: A callable(search_query) -> {"address": ..., "coordinates": {...}}
        manual_lat: Optional manual latitude (from Google Maps link).
        manual_lng: Optional manual longitude (from Google Maps link).
    """
    items = json_obj.get("recommendations", [])
    sites_list = json_obj.get("sites_list", [])

    for idx, item in enumerate(items):
        if idx == 0 and manual_lat and manual_lng:
            item["location"]["coordinates"]["lat"] = manual_lat
            item["location"]["coordinates"]["lng"] = manual_lng
            continue

        if item["location_type"] == "specific":
            hierarchy = get_site_hierarchy_string(item.get("site"), sites_list)
            full_query = f"{item['name']}, {hierarchy}".strip(", ")
            print(f"Geocoding search: '{full_query}'")
            enriched = geocode_fn(full_query)
            item["location"] = enriched

    return json_obj
