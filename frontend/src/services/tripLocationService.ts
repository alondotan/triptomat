import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { SiteNode } from '@/hooks/useCountrySites';

export interface TripLocation {
  id: string;
  tripId: string;
  parentId: string | null;
  name: string;
  siteType: string;
  sortOrder: number;
  source: string;
  createdAt: string;
}

// ── Fetch & build tree ──────────────────────────

export async function fetchTripLocations(tripId: string): Promise<TripLocation[]> {
  const { data, error } = await supabase
    .from('trip_locations')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapTripLocation);
}

export function buildLocationTree(locations: TripLocation[]): SiteNode[] {
  const byId = new Map<string, SiteNode & { _id: string; _parentId: string | null }>();
  const roots: (SiteNode & { _id: string })[] = [];

  // First pass: create all nodes
  for (const loc of locations) {
    byId.set(loc.id, {
      _id: loc.id,
      _parentId: loc.parentId,
      site: loc.name,
      site_type: loc.siteType,
      sub_sites: [],
    });
  }

  // Second pass: attach children to parents
  for (const node of byId.values()) {
    if (node._parentId) {
      const parent = byId.get(node._parentId);
      if (parent) {
        parent.sub_sites!.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Strip internal fields
  function clean(node: SiteNode & { _id?: string; _parentId?: string | null }): SiteNode {
    const { _id, _parentId, ...rest } = node;
    return {
      ...rest,
      sub_sites: rest.sub_sites && rest.sub_sites.length > 0
        ? rest.sub_sites.map(clean)
        : undefined,
    };
  }

  return roots.map(clean);
}

// ── Mutations ───────────────────────────────────

export async function addTripLocation(
  tripId: string,
  name: string,
  siteType: string,
  parentId?: string | null,
  source: string = 'manual',
): Promise<TripLocation> {
  const { data, error } = await supabase
    .from('trip_locations')
    .insert({
      trip_id: tripId,
      name,
      site_type: siteType,
      parent_id: parentId || null,
      source,
    })
    .select()
    .single();

  if (error) throw error;
  return mapTripLocation(data);
}

export async function deleteTripLocation(id: string): Promise<void> {
  const { error } = await supabase.from('trip_locations').delete().eq('id', id);
  if (error) throw error;
}

// ── Seeding ─────────────────────────────────────

let countrySitesCache: { world_hierarchy: SiteNode[] } | null = null;

async function loadCountrySites(): Promise<{ world_hierarchy: SiteNode[] }> {
  if (countrySitesCache) return countrySitesCache;
  const res = await fetch('/data/country-sites.json');
  countrySitesCache = await res.json();
  return countrySitesCache!;
}

const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'united states of america',
  'uk': 'united kingdom',
  'uae': 'united arab emirates',
};

function findCountryNode(nodes: SiteNode[], countryName: string): SiteNode | null {
  const lower = COUNTRY_ALIASES[countryName.toLowerCase()] || countryName.toLowerCase();
  let partialMatch: SiteNode | null = null;

  for (const node of nodes) {
    if (node.site_type === 'country') {
      const nodeLower = node.site.toLowerCase();
      if (nodeLower === lower) return node;
      // Fallback: partial match (e.g. "United States" matches "United States of America")
      if (!partialMatch && (nodeLower.startsWith(lower) || lower.startsWith(nodeLower))) {
        partialMatch = node;
      }
    }
    if (node.sub_sites) {
      const found = findCountryNode(node.sub_sites, countryName);
      if (found) return found;
    }
  }
  return partialMatch;
}

export async function seedTripLocations(tripId: string, countries: string[]): Promise<void> {
  console.log('[seedTripLocations] Starting seed for trip', tripId, 'countries:', countries);
  const data = await loadCountrySites();
  const countryNodes: SiteNode[] = [];

  for (const country of countries) {
    const node = findCountryNode(data.world_hierarchy, country);
    if (node) {
      countryNodes.push(node);
      console.log(`[seedTripLocations] Found country node: ${node.site} (${node.sub_sites?.length ?? 0} sub-sites)`);
    } else {
      console.warn(`[seedTripLocations] Country not found in hierarchy: "${country}"`);
    }
  }

  if (countryNodes.length === 0) {
    console.warn('[seedTripLocations] No matching country nodes found, skipping seed');
    return;
  }

  // Use the DB function for efficient batch insert in a single transaction
  const { error } = await supabase.rpc('seed_trip_locations', {
    p_trip_id: tripId,
    p_locations: countryNodes as unknown as Json,
  });

  if (error) {
    console.error('[seedTripLocations] RPC error:', error);
    throw error;
  }
  console.log('[seedTripLocations] Seed completed successfully');
}

// ── Lookup helpers ──────────────────────────────

export async function findLocationByName(
  tripId: string,
  name: string,
): Promise<TripLocation | null> {
  const { data, error } = await supabase
    .from('trip_locations')
    .select('*')
    .eq('trip_id', tripId)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTripLocation(data) : null;
}

/** Find a location by name in the flat list (no DB call) */
export function findInFlatList(
  locations: TripLocation[],
  name: string,
): TripLocation | undefined {
  return locations.find(l => l.name.toLowerCase() === name.toLowerCase());
}

/** Resolve a location name to a tree node, adding it if not found */
export async function resolveOrAddLocation(
  tripId: string,
  name: string,
  siteType: string = 'city',
  parentName?: string,
  locations?: TripLocation[],
): Promise<TripLocation> {
  // Try to find in provided flat list first (saves a DB call)
  if (locations) {
    const existing = findInFlatList(locations, name);
    if (existing) return existing;
  }

  // Try DB lookup
  const found = await findLocationByName(tripId, name);
  if (found) return found;

  // Not found - resolve parent if given
  let parentId: string | null = null;
  if (parentName) {
    const parent = locations
      ? findInFlatList(locations, parentName)
      : await findLocationByName(tripId, parentName);
    if (parent) parentId = parent.id;
  }

  return addTripLocation(tripId, name, siteType, parentId, 'webhook');
}

// ── Hierarchy helpers ───────────────────────────

/** Get all descendant names (including self) of a location by name */
export function getDescendantNames(locations: TripLocation[], ancestorName: string): Set<string> {
  const names = new Set<string>();
  const lower = ancestorName.toLowerCase();

  // Find the ancestor node(s)
  const ancestorIds = new Set<string>();
  for (const loc of locations) {
    if (loc.name.toLowerCase() === lower) {
      ancestorIds.add(loc.id);
      names.add(loc.name.toLowerCase());
    }
  }

  // BFS to collect all descendants
  let frontier = new Set(ancestorIds);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const loc of locations) {
      if (loc.parentId && frontier.has(loc.parentId)) {
        names.add(loc.name.toLowerCase());
        next.add(loc.id);
      }
    }
    frontier = next;
  }

  return names;
}

/** Build flat site list with breadcrumb paths (for grouping/filtering) */
export interface FlatTripLocation {
  label: string;
  path: string[];
  siteType: string;
  depth: number;
}

export function flattenTripLocations(locations: TripLocation[]): FlatTripLocation[] {
  const byId = new Map<string, TripLocation>();
  for (const loc of locations) byId.set(loc.id, loc);

  function getPath(loc: TripLocation): string[] {
    const path: string[] = [];
    let current: TripLocation | undefined = loc;
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  }

  return locations
    .filter(l => l.siteType !== 'country') // skip country nodes as selectable
    .map(loc => {
      const path = getPath(loc);
      return {
        label: loc.name,
        path,
        siteType: loc.siteType,
        depth: path.length - 1,
      };
    });
}

// ── Mapper ──────────────────────────────────────

function mapTripLocation(row: Record<string, unknown>): TripLocation {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    parentId: (row.parent_id as string) || null,
    name: row.name as string,
    siteType: row.site_type as string,
    sortOrder: row.sort_order as number,
    source: row.source as string,
    createdAt: row.created_at as string,
  };
}
