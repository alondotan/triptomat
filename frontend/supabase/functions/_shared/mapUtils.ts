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
