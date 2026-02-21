import { useState, useEffect, useMemo } from 'react';

export interface SiteNode {
  site: string;
  site_type: string;
  sub_sites?: SiteNode[];
}

interface WorldHierarchy {
  world_hierarchy: SiteNode[];
}

let cachedData: WorldHierarchy | null = null;
let loadingPromise: Promise<WorldHierarchy> | null = null;

async function loadHierarchy(): Promise<WorldHierarchy> {
  if (cachedData) return cachedData;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/data/country-sites.json')
    .then(r => r.json())
    .then((data: WorldHierarchy) => { cachedData = data; return data; });
  return loadingPromise;
}

function findCountryNode(nodes: SiteNode[], countryName: string): SiteNode | null {
  for (const node of nodes) {
    if (node.site_type === 'country' && node.site.toLowerCase() === countryName.toLowerCase()) {
      return node;
    }
    if (node.sub_sites) {
      const found = findCountryNode(node.sub_sites, countryName);
      if (found) return found;
    }
  }
  return null;
}

/** Flatten a site node tree into a list of { label, path } for display */
export interface FlatSite {
  label: string;
  path: string[]; // breadcrumb path e.g. ["Cuba", "Havana", "Havana Vieja"]
  siteType: string;
  depth: number;
}

function flattenSites(node: SiteNode, parentPath: string[] = []): FlatSite[] {
  const results: FlatSite[] = [];
  // Skip the country node itself as a selectable option - we want its children
  const currentPath = [...parentPath, node.site];
  if (parentPath.length > 0) {
    results.push({
      label: node.site,
      path: currentPath,
      siteType: node.site_type,
      depth: parentPath.length,
    });
  }
  if (node.sub_sites) {
    for (const child of node.sub_sites) {
      results.push(...flattenSites(child, currentPath));
    }
  }
  return results;
}

export function useCountrySites(countries: string[], extraHierarchy?: SiteNode[]) {
  const [hierarchy, setHierarchy] = useState<WorldHierarchy | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) { setHierarchy(cachedData); setLoading(false); return; }
    loadHierarchy().then(d => { setHierarchy(d); setLoading(false); });
  }, []);

  const sites = useMemo<FlatSite[]>(() => {
    if (!hierarchy || countries.length === 0) return [];
    const allSites: FlatSite[] = [];
    for (const country of countries) {
      const countryNode = findCountryNode(hierarchy.world_hierarchy, country);
      if (countryNode) {
        // Merge extra hierarchy nodes into the country node
        const mergedNode = extraHierarchy
          ? mergeHierarchyIntoCountry(countryNode, extraHierarchy, country)
          : countryNode;
        allSites.push(...flattenSites(mergedNode));
      }
    }
    return allSites;
  }, [hierarchy, countries, extraHierarchy]);

  return { sites, loading };
}

/** Deep-merge extra SiteNode[] (from webhooks) into an existing country node, adding missing sub_sites */
function mergeHierarchyIntoCountry(countryNode: SiteNode, extraNodes: SiteNode[], countryName: string): SiteNode {
  // Find extra nodes that match this country
  const matchingExtras = extraNodes.filter(
    n => n.site_type === 'country' && n.site.toLowerCase() === countryName.toLowerCase()
  );
  if (matchingExtras.length === 0) return countryNode;

  // Deep clone the country node to avoid mutating cached data
  const merged: SiteNode = JSON.parse(JSON.stringify(countryNode));

  for (const extra of matchingExtras) {
    if (extra.sub_sites) {
      mergeSubSites(merged, extra.sub_sites);
    }
  }
  return merged;
}

/** Search the entire subtree rooted at `parent` for a node with the given name */
function findNodeInSubtree(parent: SiteNode, name: string): SiteNode | null {
  if (!parent.sub_sites) return null;
  for (const child of parent.sub_sites) {
    if (child.site.toLowerCase() === name.toLowerCase()) return child;
    const found = findNodeInSubtree(child, name);
    if (found) return found;
  }
  return null;
}

function mergeSubSites(parent: SiteNode, newChildren: SiteNode[]) {
  if (!parent.sub_sites) parent.sub_sites = [];
  for (const child of newChildren) {
    // Check direct children first
    const directMatch = parent.sub_sites.find(
      s => s.site.toLowerCase() === child.site.toLowerCase()
    );
    if (directMatch) {
      // Recurse into existing node to add deeper children
      if (child.sub_sites && child.sub_sites.length > 0) {
        mergeSubSites(directMatch, child.sub_sites);
      }
    } else {
      // Search deeper in the tree — the node may already exist at a lower level
      // (e.g. AI returns Country→City but hierarchy has Country→Region→City)
      const deepMatch = findNodeInSubtree(parent, child.site);
      if (deepMatch) {
        if (child.sub_sites && child.sub_sites.length > 0) {
          mergeSubSites(deepMatch, child.sub_sites);
        }
      } else {
        // Truly new — add at current level
        parent.sub_sites.push(JSON.parse(JSON.stringify(child)));
      }
    }
  }
}
