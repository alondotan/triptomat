import { useState, useEffect, useMemo, useCallback } from 'react';

export interface WorldTreeNode {
  name: string;
  name_he: string;
  type: 'world' | 'continent' | 'region' | 'country' | 'tourism_region';
  country_code?: string;
  flag?: string;
  image?: string;
  children?: WorldTreeNode[];
}

let cachedTree: WorldTreeNode | null = null;
let loadingPromise: Promise<WorldTreeNode> | null = null;

async function loadWorldTree(): Promise<WorldTreeNode> {
  if (cachedTree) return cachedTree;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/data/world_tree.json')
    .then(r => r.json())
    .then((data: WorldTreeNode) => { cachedTree = data; return data; });
  return loadingPromise;
}

/** Collect all country names under a given node */
export function collectCountries(node: WorldTreeNode): string[] {
  if (node.type === 'country') return [node.name];
  const countries: string[] = [];
  for (const child of node.children ?? []) {
    countries.push(...collectCountries(child));
  }
  return countries;
}

/** Collect all country codes under a given node */
export function collectCountryCodes(node: WorldTreeNode): string[] {
  if (node.type === 'country' && node.country_code) return [node.country_code];
  const codes: string[] = [];
  for (const child of node.children ?? []) {
    codes.push(...collectCountryCodes(child));
  }
  return codes;
}

export function useWorldTree() {
  const [tree, setTree] = useState<WorldTreeNode | null>(cachedTree);
  const [loading, setLoading] = useState(!cachedTree);

  useEffect(() => {
    if (cachedTree) { setTree(cachedTree); setLoading(false); return; }
    loadWorldTree().then(d => { setTree(d); setLoading(false); });
  }, []);

  /** Flat list of all countries for backwards compatibility */
  const allCountries = useMemo(() => {
    if (!tree) return [];
    return collectCountries(tree).sort((a, b) => a.localeCompare(b));
  }, [tree]);

  /** Map from country name to country_code */
  const countryCodeMap = useMemo(() => {
    if (!tree) return new Map<string, string>();
    const map = new Map<string, string>();
    function walk(node: WorldTreeNode) {
      if (node.type === 'country' && node.country_code) {
        map.set(node.name, node.country_code);
      }
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree);
    return map;
  }, [tree]);

  return { tree, loading, allCountries, countryCodeMap };
}

/** Navigate to a path in the tree and return the node */
export function navigateTree(root: WorldTreeNode, path: WorldTreeNode[]): WorldTreeNode {
  if (path.length === 0) return root;
  return path[path.length - 1];
}
