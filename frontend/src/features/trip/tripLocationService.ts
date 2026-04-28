import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { SiteNode } from '@/features/geodata/useCountrySites';
import { createOrMergePOI } from '@/features/poi/poiService';
import type { PointOfInterest } from '@/types/trip';

// ── Per-country JSON types ──────────────────────

export interface CountryLocationNode {
  id: string;
  type: string;
  // New format
  names?: { en: string; he: string };
  descriptions?: { en: string; he: string };
  image?: string;
  // Legacy flat fields (backward compat)
  name?: string;
  name_he?: string;
  description?: string;
  description_he?: string;
  coordinates?: { lat: number; lng: number };
  population?: number;
  is_capital?: boolean;
  topAttractions?: string[];
  children?: CountryLocationNode[];
}

/** Get the display name of a location node in the given language */
export function getNodeName(node: CountryLocationNode, lang: 'en' | 'he' = 'en'): string {
  return node.names?.[lang] ?? (lang === 'he' ? node.name_he : undefined) ?? node.names?.en ?? node.name ?? node.id;
}

/** Get the description of a location node in the given language */
export function getNodeDescription(node: CountryLocationNode, lang: 'en' | 'he' = 'en'): string | undefined {
  return node.descriptions?.[lang] ?? (lang === 'he' ? node.description_he : node.description);
}

export interface CountryPlace {
  id: string;
  place_type?: string;
  activity_type?: string;
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
  // New format (at root level, alongside data/locations)
  names?: { en: string; he: string };
  descriptions?: { en: string; he: string };
  image?: string;
  data: {
    country_code: string;
    site_type: string;
    // Legacy flat fields (backward compat)
    name?: string;
    name_he?: string;
    description?: string;
    description_he?: string;
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

/** Get the display name of a country from CountryData in the given language */
export function getCountryName(data: CountryData, lang: 'en' | 'he' = 'en'): string {
  return data.names?.[lang] ?? (lang === 'he' ? data.data.name_he : undefined) ?? data.names?.en ?? data.data.name ?? data.id;
}

/** Get the description of a country from CountryData in the given language */
export function getCountryDescription(data: CountryData, lang: 'en' | 'he' = 'en'): string | undefined {
  return data.descriptions?.[lang] ?? (lang === 'he' ? data.data.description_he : data.data.description);
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

export function buildLocationTree(
  locations: TripLocation[],
  descMap?: Map<string, { name_he?: string }>,
): SiteNode[] {
  const byId = new Map<string, SiteNode & { _id: string; _parentId: string | null }>();
  const roots: (SiteNode & { _id: string })[] = [];

  // First pass: create all nodes
  for (const loc of locations) {
    const name_he = descMap
      ? (descMap.get(loc.externalId ?? '')?.name_he ?? descMap.get(loc.name)?.name_he)
      : undefined;
    byId.set(loc.id, {
      _id: loc.id,
      _parentId: loc.parentId,
      site: loc.name,
      site_he: name_he || undefined,
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

// ── Country weather (climatology) ────────────────

export interface WeatherMonth {
  temp_high_c: number;
  temp_low_c: number;
  precipitation_mm: number;
  rain_days: number;
  snow_days: number;
  sunshine_hours: number;
}

export interface WeatherRegionData {
  name: string;
  name_he?: string;
  monthly: Record<string, WeatherMonth>; // keys "1"–"12"
}

export interface CountryWeatherData {
  country: string;
  regions: Record<string, WeatherRegionData>; // keys are region externalIds
}

const countryWeatherCache = new Map<string, CountryWeatherData | null>();

export async function loadCountryWeatherData(countryName: string): Promise<CountryWeatherData | null> {
  if (countryWeatherCache.has(countryName)) return countryWeatherCache.get(countryName)!;
  try {
    const res = await fetch(
      `https://triptomat-media.s3.eu-central-1.amazonaws.com/geodata/countries_weather/${encodeURIComponent(countryName)}.json`,
      { cache: 'no-store' },
    );
    if (!res.ok) { countryWeatherCache.set(countryName, null); return null; }
    const data: CountryWeatherData = await res.json();
    countryWeatherCache.set(countryName, data);
    return data;
  } catch {
    countryWeatherCache.set(countryName, null);
    return null;
  }
}

/** Find the best-matching monthly weather data for a location.
 *  Tries: exact externalId → prefix match → name match → first region. */
export function findWeatherMonthly(
  weatherData: CountryWeatherData,
  externalId: string | null,
  locationName: string,
): WeatherMonth[] | null {
  const regions = weatherData.regions;

  let regionData: WeatherRegionData | undefined;

  if (externalId) {
    regionData = regions[externalId];
    if (!regionData) {
      // prefix match: location is a child of a region
      for (const [regionId, rd] of Object.entries(regions)) {
        if (externalId.startsWith(regionId + '/') || externalId === regionId) {
          regionData = rd; break;
        }
      }
    }
  }
  if (!regionData) {
    regionData = Object.values(regions).find(
      rd => rd.name === locationName || rd.name_he === locationName,
    );
  }
  if (!regionData) regionData = Object.values(regions)[0];
  if (!regionData) return null;

  return Array.from({ length: 12 }, (_, i) => regionData!.monthly[String(i + 1)]).filter(Boolean) as WeatherMonth[];
}

// ── Seeding ─────────────────────────────────────

// Cache per-country data to avoid re-fetching
const countryDataCache = new Map<string, CountryData | null>();

/** Try to load a per-country JSON file; returns null if not found */
export async function loadCountryData(countryName: string): Promise<CountryData | null> {
  if (countryDataCache.has(countryName)) return countryDataCache.get(countryName)!;

  try {
    const res = await fetch(`https://triptomat-media.s3.eu-central-1.amazonaws.com/geodata/countries/${encodeURIComponent(countryName)}.json`, { cache: 'no-store' });
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
    site: getNodeName(node, 'en'),
    site_he: getNodeName(node, 'he'),
    site_type: node.type,
    external_id: node.id,
    sub_sites: node.children && node.children.length > 0
      ? node.children.map(countryLocationToSiteNode)
      : undefined,
  };
}

/** Build a map of externalId AND name → {description, description_he, image} from all loaded country data.
 *  Indexed by both node.id (externalId) and node.name / node.name_he so callers can look up
 *  even when the stored externalId doesn't match the JSON id. */
export function buildDescriptionMap(
  countries: Array<CountryData | null>,
): Map<string, { name_he?: string; description?: string; description_he?: string; image?: string }> {
  const map = new Map<string, { name_he?: string; description?: string; description_he?: string; image?: string }>();

  function setEntry(key: string | undefined, entry: { name_he?: string; description?: string; description_he?: string; image?: string }) {
    if (key && !map.has(key)) map.set(key, entry);
  }

  for (const data of countries) {
    if (!data) continue;
    const countryDesc = data.descriptions?.en ?? data.data.description;
    const countryDescHe = data.descriptions?.he ?? data.data.description_he;
    const countryNameHe = data.names?.he ?? data.data.name_he;
    const countryEntry = { name_he: countryNameHe, description: countryDesc, description_he: countryDescHe, image: data.image };
    if (countryDesc || countryDescHe || data.image || countryNameHe) {
      setEntry(data.id, countryEntry);
      setEntry(data.names?.en ?? data.data.name, countryEntry);
      setEntry(data.names?.he ?? data.data.name_he, countryEntry);
    }

    function walkNode(node: CountryLocationNode) {
      const desc = node.descriptions?.en ?? node.description;
      const descHe = node.descriptions?.he ?? node.description_he;
      const nameHe = getNodeName(node, 'he');
      if (desc || descHe || node.image || nameHe) {
        const entry = { name_he: nameHe, description: desc, description_he: descHe, image: node.image };
        setEntry(node.id, entry);
        setEntry(getNodeName(node, 'en'), entry);
        setEntry(getNodeName(node, 'he'), entry);
      }
      for (const child of node.children || []) walkNode(child);
    }
    for (const loc of data.locations) walkNode(loc);
  }
  return map;
}

/** Build a flat map of locationId → node name (English) from the country locations tree */
export function buildLocationIdMap(nodes: CountryLocationNode[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(node: CountryLocationNode) {
    map.set(node.id, getNodeName(node, 'en'));
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
        site: getCountryName(countryData, 'en'),
        site_he: getCountryName(countryData, 'he'),
        site_type: 'country',
        sub_sites: subSites.length > 0 ? subSites : undefined,
      };
      countryNodes.push(countryNode);
      console.log(`[seedTripLocations] Loaded per-country file: ${country} (${subSites.length} regions, ${countryData.places?.length ?? 0} places)`);

      // Collect places to seed as POIs
      if (countryData.places && countryData.places.length > 0) {
        placesToSeed.push({
          countryName: getCountryName(countryData, 'en'),
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
        placeType: place.place_type || undefined,
        activityType: place.activity_type || undefined,
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
        imageUrl: place.image || place.photo_url || undefined,
      };

      try {
        const seededAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        await createOrMergePOI(poi, { createdAt: seededAt });
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
