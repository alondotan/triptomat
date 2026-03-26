import { useState, useEffect, useMemo, useCallback } from 'react';
import type { GeoJSON } from 'geojson';
import {
  loadCountryData,
  type CountryData,
  type CountryLocationNode,
  type CountryPlace,
} from '@/features/trip/tripLocationService';

// ── Sub-category icon map ────────────────────────

let typeIconMapCache: Record<string, string> | null = null;
let typeIconMapPromise: Promise<Record<string, string>> | null = null;

async function loadTypeIconMap(): Promise<Record<string, string>> {
  if (typeIconMapCache) return typeIconMapCache;
  if (typeIconMapPromise) return typeIconMapPromise;
  typeIconMapPromise = fetch('/data/sub-categories.json')
    .then(r => r.json())
    .then((data: { master_list: { type: string; icon: string }[] }) => {
      const map: Record<string, string> = {};
      for (const item of data.master_list) {
        if (item.type && item.icon) map[item.type] = item.icon;
      }
      typeIconMapCache = map;
      return map;
    })
    .catch(() => ({}));
  return typeIconMapPromise;
}

// ── Navigation node types ───────────────────────

export interface NavigationNode {
  id: string;
  name: string;
  type: string;
  coordinates?: { lat: number; lng: number };
  topAttractions?: string[];
  children: NavigationNode[];
}

export interface ChildRegion {
  node: NavigationNode;
  boundary?: GeoJSON.Geometry;
  center?: [number, number];
}

export interface Breadcrumb {
  name: string;
  node: NavigationNode;
}

// ── Hook ────────────────────────────────────────

export function useCountryMapData(countries: string[]) {
  const [countryDataMap, setCountryDataMap] = useState<Record<string, CountryData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [navigationStack, setNavigationStack] = useState<NavigationNode[]>([]);
  const [currentNode, setCurrentNode] = useState<NavigationNode | null>(null);
  const [typeIconMap, setTypeIconMap] = useState<Record<string, string>>({});

  // Load sub-category icon map
  useEffect(() => {
    loadTypeIconMap().then(setTypeIconMap);
  }, []);

  // Load country data on mount / countries change
  useEffect(() => {
    if (countries.length === 0) return;
    let cancelled = false;
    setIsLoading(true);

    Promise.all(
      countries.map(async (c) => {
        const data = await loadCountryData(c);
        return data ? ([c, data] as const) : null;
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, CountryData> = {};
      for (const r of results) {
        if (r) map[r[0]] = r[1];
      }
      setCountryDataMap(map);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [countries.join(',')]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Build merged boundaries index (location id → GeoJSON geometry)
  const boundaries = useMemo(() => {
    const merged: Record<string, GeoJSON.Geometry> = {};
    for (const data of Object.values(countryDataMap)) {
      if (data.boundaries && typeof data.boundaries === 'object') {
        Object.assign(merged, data.boundaries);
      }
      // Synthesize a country-level boundary from geoData features
      if (data.geoData && typeof data.geoData === 'object') {
        const fc = data.geoData as GeoJSON.FeatureCollection;
        if (fc.type === 'FeatureCollection' && fc.features?.length > 0) {
          const polygons: GeoJSON.Position[][][] = [];
          for (const f of fc.features) {
            if (f.geometry?.type === 'Polygon') {
              polygons.push((f.geometry as GeoJSON.Polygon).coordinates);
            } else if (f.geometry?.type === 'MultiPolygon') {
              polygons.push(...(f.geometry as GeoJSON.MultiPolygon).coordinates);
            }
          }
          if (polygons.length > 0) {
            merged[data.id] = { type: 'MultiPolygon', coordinates: polygons };
          }
        }
      }
    }
    return merged;
  }, [countryDataMap]);

  // Build places index (place id AND name → CountryPlace)
  const placesIndex = useMemo(() => {
    const index: Record<string, CountryPlace> = {};
    for (const data of Object.values(countryDataMap)) {
      for (const p of (data.places || [])) {
        if (p.id) index[p.id] = p;
        index[p.name] = p;
      }
    }
    return index;
  }, [countryDataMap]);

  // Build root navigation node from loaded country data
  const rootNode = useMemo<NavigationNode | null>(() => {
    const entries = Object.values(countryDataMap);
    if (entries.length === 0) return null;

    const isHe = document.documentElement.lang === 'he';

    function toNavNode(node: CountryLocationNode): NavigationNode {
      return {
        id: node.id,
        name: (isHe && node.name_he) ? node.name_he : node.name,
        type: node.type,
        coordinates: node.coordinates,
        topAttractions: node.topAttractions,
        children: (node.children || []).map(toNavNode),
      };
    }

    if (entries.length === 1) {
      // Single country — root is the country itself
      const data = entries[0];
      return {
        id: data.id,
        name: (isHe && data.data.name_he) ? data.data.name_he : data.data.name,
        type: 'country',
        topAttractions: data.topAttractions,
        children: data.locations.map(toNavNode),
      };
    }

    // Multiple countries — virtual root
    return {
      id: '_root',
      name: 'Trip',
      type: 'root',
      children: entries.map((data) => {
        // Compute country center from first region's coordinates or from geoData
        let coordinates: { lat: number; lng: number } | undefined;
        const firstWithCoords = data.locations.find(l => l.coordinates);
        if (firstWithCoords?.coordinates) {
          // Average all region centers for a better country centroid
          const withCoords = data.locations.filter(l => l.coordinates);
          coordinates = {
            lat: withCoords.reduce((s, l) => s + l.coordinates!.lat, 0) / withCoords.length,
            lng: withCoords.reduce((s, l) => s + l.coordinates!.lng, 0) / withCoords.length,
          };
        }
        return {
          id: data.id,
          name: (isHe && data.data.name_he) ? data.data.name_he : data.data.name,
          type: 'country',
          coordinates,
          topAttractions: data.topAttractions,
          children: data.locations.map(toNavNode),
        };
      }),
    };
  }, [countryDataMap]);

  // Auto-set root when data loads
  useEffect(() => {
    if (rootNode && !currentNode) {
      setCurrentNode(rootNode);
      setNavigationStack([]);
    }
  }, [rootNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation
  const navigateTo = useCallback((node: NavigationNode) => {
    setNavigationStack((prev) => currentNode ? [...prev, currentNode] : prev);
    setCurrentNode(node);
  }, [currentNode]);

  const goBack = useCallback(() => {
    setNavigationStack((prev) => {
      if (prev.length === 0) return prev;
      const newStack = [...prev];
      const parent = newStack.pop()!;
      setCurrentNode(parent);
      return newStack;
    });
  }, []);

  const jumpTo = useCallback((index: number) => {
    setNavigationStack((prev) => {
      const target = prev[index];
      if (!target) return prev;
      setCurrentNode(target);
      return prev.slice(0, index);
    });
  }, []);

  // Derived: breadcrumbs
  const breadcrumbs = useMemo<Breadcrumb[]>(() => {
    const crumbs: Breadcrumb[] = navigationStack.map((n) => ({ name: n.name, node: n }));
    if (currentNode) crumbs.push({ name: currentNode.name, node: currentNode });
    return crumbs;
  }, [navigationStack, currentNode]);

  // Derived: current boundary
  const currentBoundary = useMemo(
    () => (currentNode ? boundaries[currentNode.id] || null : null),
    [currentNode, boundaries],
  );

  // Derived: child regions with boundaries and centers
  const childRegions = useMemo<ChildRegion[]>(() => {
    if (!currentNode) return [];
    return currentNode.children.map((child) => {
      const boundary = boundaries[child.id];
      let center: [number, number] | undefined;
      if (child.coordinates) {
        center = [child.coordinates.lat, child.coordinates.lng];
      } else if (boundary) {
        // Compute center from boundary - crude centroid
        center = computeGeoJSONCentroid(boundary);
      }
      return { node: child, boundary, center };
    });
  }, [currentNode, boundaries]);

  // Derived: top attractions resolved to CountryPlace objects
  const topAttractions = useMemo<CountryPlace[]>(() => {
    if (!currentNode?.topAttractions) return [];
    return currentNode.topAttractions
      .map((id) => placesIndex[id])
      .filter(Boolean) as CountryPlace[];
  }, [currentNode, placesIndex]);

  return {
    isLoading,
    currentNode,
    breadcrumbs,
    currentBoundary,
    childRegions,
    topAttractions,
    placesIndex,
    typeIconMap,
    navigateTo,
    goBack,
    jumpTo,
    canGoBack: navigationStack.length > 0,
  };
}

// ── Helpers ─────────────────────────────────────

function computeGeoJSONCentroid(geometry: GeoJSON.Geometry): [number, number] | undefined {
  const coords: number[][] = [];
  extractCoords(geometry, coords);
  if (coords.length === 0) return undefined;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  return [lat, lng];
}

function extractCoords(geom: GeoJSON.Geometry, out: number[][]) {
  switch (geom.type) {
    case 'Point':
      out.push(geom.coordinates as number[]);
      break;
    case 'MultiPoint':
    case 'LineString':
      for (const c of geom.coordinates) out.push(c as number[]);
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geom.coordinates) for (const c of ring) out.push(c as number[]);
      break;
    case 'MultiPolygon':
      for (const poly of geom.coordinates) for (const ring of poly) for (const c of ring) out.push(c as number[]);
      break;
    case 'GeometryCollection':
      for (const g of geom.geometries) extractCoords(g, out);
      break;
  }
}
