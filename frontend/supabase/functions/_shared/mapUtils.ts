import type { SiteNode } from "./types.ts";

/** Build a map from every site name (lowercased) → its parent country name */
export function buildSiteToCountryMap(hierarchy: SiteNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of hierarchy) {
    if (node.site_type === "country") {
      collectSitesUnderCountry(node, node.site, map);
    }
  }
  return map;
}

function collectSitesUnderCountry(node: SiteNode, country: string, map: Record<string, string>) {
  map[node.site.toLowerCase()] = country;
  if (node.sub_sites) {
    for (const sub of node.sub_sites) {
      collectSitesUnderCountry(sub, country, map);
    }
  }
}

/**
 * Build a map from every site name (lowercased) → its nearest "city" ancestor.
 * The "city" is the first-level child under each country node in the hierarchy.
 * Sub-locations (neighborhoods, beaches, etc.) map to their city parent.
 * City-level nodes map to themselves.
 */
export function buildSiteToCityMap(hierarchy: SiteNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of hierarchy) {
    if (node.site_type === "country") {
      for (const cityNode of (node.sub_sites || [])) {
        collectSitesForCity(cityNode, cityNode.site, map);
      }
    }
  }
  return map;
}

function collectSitesForCity(node: SiteNode, city: string, map: Record<string, string>) {
  map[node.site.toLowerCase()] = city;
  if (node.sub_sites) {
    for (const sub of node.sub_sites) {
      collectSitesForCity(sub, city, map);
    }
  }
}
