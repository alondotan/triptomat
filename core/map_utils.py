"""
Site hierarchy utilities and fuzzy matching.

Ported from the TypeScript Edge Functions:
  - _shared/mapUtils.ts  (site hierarchy maps)
  - _shared/matching.ts  (fuzzy matching)
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Site hierarchy utilities
# ---------------------------------------------------------------------------

def build_site_to_country_map(hierarchy: list[dict]) -> dict[str, str]:
    """Map every site name (lowercased) in the hierarchy to its parent country.

    *hierarchy* is a list of SiteNode dicts::

        {"site": "Japan", "site_type": "country", "sub_sites": [...]}

    Walk the tree recursively.  Every node gets mapped to the root country name.

    Returns e.g. ``{"tokyo": "Japan", "shibuya": "Japan", ...}``
    """
    result: dict[str, str] = {}
    for node in hierarchy:
        if node.get("site_type") == "country":
            _collect_sites_under_country(node, node["site"], result)
    return result


def _collect_sites_under_country(
    node: dict, country: str, out: dict[str, str]
) -> None:
    out[node["site"].lower()] = country
    for sub in node.get("sub_sites") or []:
        _collect_sites_under_country(sub, country, out)


def build_site_to_city_map(hierarchy: list[dict]) -> dict[str, str]:
    """Map every site name (lowercased) to its nearest city ancestor.

    A "city" is defined as the first-level child under a country (even if
    ``site_type`` is ``'region'`` or ``'state'``).

    * Nodes **at** city level map to themselves.
    * Nodes **below** city level map to their city ancestor.
    * Country-level nodes do **not** appear in the map.
    """
    result: dict[str, str] = {}
    for node in hierarchy:
        if node.get("site_type") == "country":
            for city_node in node.get("sub_sites") or []:
                _collect_sites_for_city(city_node, city_node["site"], result)
    return result


def _collect_sites_for_city(
    node: dict, city: str, out: dict[str, str]
) -> None:
    out[node["site"].lower()] = city
    for sub in node.get("sub_sites") or []:
        _collect_sites_for_city(sub, city, out)


def extract_countries(hierarchy: list[dict]) -> list[str]:
    """Extract all country names from the top level of a site hierarchy."""
    return [
        node["site"]
        for node in hierarchy
        if node.get("site_type") == "country"
    ]


def extract_cities(hierarchy: list[dict]) -> list[str]:
    """Extract all city/region names from the second level of a site hierarchy."""
    cities: list[str] = []
    for node in hierarchy:
        if node.get("site_type") == "country":
            for child in node.get("sub_sites") or []:
                cities.append(child["site"])
    return cities


# ---------------------------------------------------------------------------
# Fuzzy matching
# ---------------------------------------------------------------------------

def fuzzy_match(a: str | None, b: str | None) -> bool:
    """Case-insensitive fuzzy match: *a* == *b* OR *a* contains *b* OR *b* contains *a*.

    Returns ``False`` if either value is empty or ``None``.
    """
    if not a or not b:
        return False
    x = a.lower().strip()
    y = b.lower().strip()
    if not x or not y:
        return False
    return x == y or x in y or y in x
