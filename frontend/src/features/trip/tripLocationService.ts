import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { SiteNode } from '@/features/geodata/useCountrySites';
import { createOrMergePOI } from '@/features/poi/poiService';
import type { PointOfInterest } from '@/types/trip';

// ── Per-country JSON types ──────────────────────

export interface CountryLocationNode {
  id: string;
  type: string;
  name: string;
  name_he?: string;
  coordinates?: { lat: number; lng: number };
  population?: number;
  is_capital?: boolean;
  topAttractions?: string[];
  children?: CountryLocationNode[];
}

export interface CountryPlace {
  id: string;
  placeType: string;
  name: string;
  description?: string;
  maps_id?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  rating?: number;
  user_ratings_total?: number;
  photo_url?: string;
  image?: string;
  locationId?: string;
  locationPath?: string[];
}

export interface CountryData {
  id: string;
  type: string;
  data: {
    country_code: string;
    site_type: string;
    name: string;
    name_he?: string;
    currency?: string;
    phone_prefix?: string;
    timezone?: string;
  };
  topAttractions?: string[];
  locations: CountryLocationNode[];
  places?: CountryPlace[];
  geoData?: unknown;
  boundaries?: unknown;
}

export interface TripLocation {
  id: string;
  tripId: string;
  parentId: string | null;
  name: string;
  placeType: string;
  externalId: string | null;
  sortOrder: number;
  source: string;
  notes: string;
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
      site_type: loc.placeType,
      external_id: loc.externalId || undefined,
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
  externalId?: string,
): Promise<TripLocation> {
  // Auto-generate external_id from parent's external_id + slugified name
  let resolvedExternalId = externalId;
  if (!resolvedExternalId && parentId) {
    const { data: parentRow } = await supabase
      .from('trip_locations')
      .select('external_id')
      .eq('id', parentId)
      .single();
    const parentExtId = parentRow?.external_id as string | null;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    resolvedExternalId = parentExtId ? `${parentExtId}/${slug}` : slug;
  }

  const { data, error } = await supabase
    .from('trip_locations')
    .insert({
      trip_id: tripId,
      name,
      place_type: siteType,
      parent_id: parentId || null,
      source,
      external_id: resolvedExternalId || null,
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

// Cache per-country data to avoid re-fetching
const countryDataCache = new Map<string, CountryData | null>();

/** Try to load a per-country JSON file; returns null if not found */
export async function loadCountryData(countryName: string): Promise<CountryData | null> {
  if (countryDataCache.has(countryName)) return countryDataCache.get(countryName)!;

  try {
    const res = await fetch(`https://triptomat-media.s3.eu-central-1.amazonaws.com/geodata/countries/${encodeURIComponent(countryName)}.json`);
    if (!res.ok) {
      countryDataCache.set(countryName, null);
      return null;
    }
    const data: CountryData = await res.json();
    countryDataCache.set(countryName, data);
    return data;
  } catch {
    countryDataCache.set(countryName, null);
    return null;
  }
}

/** Convert per-country location tree to SiteNode format for the existing RPC */
function countryLocationToSiteNode(node: CountryLocationNode): SiteNode {
  return {
    site: node.name,
    site_type: node.type,
    external_id: node.id,
    sub_sites: node.children && node.children.length > 0
      ? node.children.map(countryLocationToSiteNode)
      : undefined,
  };
}

/** Build a flat map of locationId → node name from the country locations tree */
export function buildLocationIdMap(nodes: CountryLocationNode[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(node: CountryLocationNode) {
    map.set(node.id, node.name);
    for (const c of (node.children || [])) walk(c);
  }
  for (const n of nodes) walk(n);
  return map;
}


export async function seedTripLocations(tripId: string, countries: string[]): Promise<void> {
  console.log('[seedTripLocations] Starting seed for trip', tripId, 'countries:', countries);
  const countryNodes: SiteNode[] = [];
  const placesToSeed: { countryName: string; places: CountryPlace[]; locationIdMap: Map<string, string> }[] = [];

  for (const country of countries) {
    // Try per-country file first
    const countryData = await loadCountryData(country);
    if (countryData) {
      // Convert locations → SiteNode, wrapped in a country-level node
      const subSites = countryData.locations.map(countryLocationToSiteNode);
      const countryNode: SiteNode = {
        site: countryData.data.name,
        site_type: 'country',
        sub_sites: subSites.length > 0 ? subSites : undefined,
      };
      countryNodes.push(countryNode);
      console.log(`[seedTripLocations] Loaded per-country file: ${country} (${subSites.length} regions, ${countryData.places?.length ?? 0} places)`);

      // Collect places to seed as POIs
      if (countryData.places && countryData.places.length > 0) {
        placesToSeed.push({
          countryName: countryData.data.name,
          places: countryData.places,
          locationIdMap: buildLocationIdMap(countryData.locations),
        });
      }
    } else {
      console.warn(`[seedTripLocations] No per-country file found for: "${country}"`);
    }
  }

  if (countryNodes.length === 0) {
    console.warn('[seedTripLocations] No matching country nodes found, skipping seed');
    return;
  }

  // Seed locations via the existing RPC
  const { error } = await supabase.rpc('seed_trip_locations', {
    p_trip_id: tripId,
    p_locations: countryNodes as unknown as Json,
  });

  if (error) {
    console.error('[seedTripLocations] RPC error:', error);
    throw error;
  }
  console.log('[seedTripLocations] Seed completed successfully');

  // Seed POIs from places (fire-and-forget per place, don't block trip creation)
  if (placesToSeed.length > 0) {
    seedTripPOIs(tripId, placesToSeed).catch(e =>
      console.error('[seedTripLocations] POI seeding error:', e)
    );
  }
}

/** Create POIs from per-country places data */
async function seedTripPOIs(
  tripId: string,
  countrySets: { countryName: string; places: CountryPlace[]; locationIdMap: Map<string, string> }[],
): Promise<void> {
  console.log('[seedTripPOIs] Starting POI seed for', countrySets.reduce((s, c) => s + c.places.length, 0), 'places');

  for (const { countryName, places, locationIdMap } of countrySets) {
    for (const place of places) {
      // Resolve city name from locationId
      const cityName = place.locationId ? locationIdMap.get(place.locationId) : undefined;

      const poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'> = {
        tripId,
        category: 'attraction',
        placeType: place.placeType || undefined,
        name: place.name,
        status: 'suggested',
        location: {
          country: countryName,
          city: cityName,
          address: place.address || undefined,
          coordinates: place.coordinates,
        },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        details: {},
        isCancelled: false,
        isPaid: false,
        imageUrl: place.photo_url || place.image || undefined,
      };

      try {
        await createOrMergePOI(poi);
      } catch (e) {
        console.warn(`[seedTripPOIs] Failed to create POI "${place.name}":`, e);
      }
    }
  }

  console.log('[seedTripPOIs] POI seed completed');
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
  placeType: string;
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
    .filter(l => l.placeType !== 'country') // skip country nodes as selectable
    .map(loc => {
      const path = getPath(loc);
      return {
        label: loc.name,
        path,
        placeType: loc.placeType,
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
    placeType: row.place_type as string,
    externalId: (row.external_id as string) || null,
    sortOrder: row.sort_order as number,
    source: row.source as string,
    notes: (row.notes as string) || '',
    createdAt: row.created_at as string,
  };
}
