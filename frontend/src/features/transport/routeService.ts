// ── Route calculation service — OSRM integration ────────────────────────────

export type TravelMode = 'car' | 'walk' | 'bus' | 'flight' | 'train' | 'ferry' | 'other_transport';

export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  mode: TravelMode;
  distanceKm: number;
  durationMin: number;
  polyline: [number, number][]; // [lat, lng][] for Leaflet
  transportLabel?: string;     // e.g. "✈️ EL AL 123"
  isUnknown?: boolean;         // true when non-routable and no times available
}

export interface RouteStats {
  stops: number;
  totalDistanceKm: number;
  totalTravelMin: number;
  totalStayMin: number;
}

export interface RouteStop {
  id: string;
  lat: number;
  lng: number;
  durationMin: number;
  placeType?: string;
}

/** Override for a specific leg — built from Transport entities in the schedule. */
export interface LegOverride {
  visualMode: TravelMode;
  osrmMode: 'car' | 'walk' | null; // null = non-routable
  durationMin?: number;             // from departure/arrival times
  fromCoords?: { lat: number; lng: number };
  toCoords?: { lat: number; lng: number };
  label?: string;
}

// ── Transport category classification ────────────────────────────────────────

/** Maps each transport category to its visual mode and OSRM routing mode. */
export const TRANSPORT_CATEGORY_CONFIG: Record<string, { visualMode: TravelMode; osrmMode: 'car' | 'walk' | null }> = {
  // Flights → non-routable
  airplane:            { visualMode: 'flight', osrmMode: null },
  domesticFlight:      { visualMode: 'flight', osrmMode: null },
  internationalFlight: { visualMode: 'flight', osrmMode: null },
  // Trains → non-routable
  train:               { visualMode: 'train', osrmMode: null },
  nightTrain:          { visualMode: 'train', osrmMode: null },
  highSpeedTrain:      { visualMode: 'train', osrmMode: null },
  // Water → non-routable
  ferry:               { visualMode: 'ferry', osrmMode: null },
  cruise:              { visualMode: 'ferry', osrmMode: null },
  cruiseShip:          { visualMode: 'ferry', osrmMode: null },
  boatTaxi:            { visualMode: 'ferry', osrmMode: null },
  // Cable / other → non-routable
  cableCar:            { visualMode: 'other_transport', osrmMode: null },
  funicular:           { visualMode: 'other_transport', osrmMode: null },
  otherTransportation: { visualMode: 'other_transport', osrmMode: null },
  // Public transport → OSRM car (road-based approximation)
  bus:                 { visualMode: 'bus', osrmMode: 'car' },
  subway:              { visualMode: 'bus', osrmMode: 'car' },
  tram:                { visualMode: 'bus', osrmMode: 'car' },
  // Driving → OSRM car
  taxi:                { visualMode: 'car', osrmMode: 'car' },
  carRental:           { visualMode: 'car', osrmMode: 'car' },
  rideshare:           { visualMode: 'car', osrmMode: 'car' },
  privateTransfer:     { visualMode: 'car', osrmMode: 'car' },
  car:                 { visualMode: 'car', osrmMode: 'car' },
  motorcycle:          { visualMode: 'car', osrmMode: 'car' },
  rv:                  { visualMode: 'car', osrmMode: 'car' },
  // Walk-like → OSRM foot
  walk:                { visualMode: 'walk', osrmMode: 'walk' },
  bicycle:             { visualMode: 'walk', osrmMode: 'walk' },
  scooter:             { visualMode: 'walk', osrmMode: 'walk' },
};

// ── Styling ──────────────────────────────────────────────────────────────────

export const MODE_COLORS: Record<TravelMode, string> = {
  car:             '#4f46e5', // indigo
  walk:            '#16a34a', // green
  bus:             '#0891b2', // cyan
  flight:          '#dc2626', // red
  train:           '#7c3aed', // violet
  ferry:           '#0284c7', // sky
  other_transport: '#d97706', // amber
};

/** Dashed lines for non-routable modes, solid for OSRM-routed. */
export const MODE_DASH: Record<TravelMode, string | undefined> = {
  car:             undefined,
  walk:            undefined,
  bus:             undefined,
  flight:          '10 6',
  train:           '8 5',
  ferry:           '6 4',
  other_transport: '4 4',
};

// ── OSRM ─────────────────────────────────────────────────────────────────────

const OSRM_ENDPOINTS: Record<'car' | 'walk', string> = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
};

/**
 * Fetch a single route leg between two coordinates via OSRM.
 */
export async function fetchRouteLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: 'car' | 'walk' = 'car',
): Promise<Omit<RouteLeg, 'fromStopId' | 'toStopId'>> {
  const coord = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_ENDPOINTS[mode]}/${coord}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message || 'Route not found');
  }

  const route = data.routes[0];
  return {
    mode,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    polyline: route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
    ),
  };
}

/**
 * Calculate the full route for a day: sequential legs between consecutive stops.
 *
 * @param overrides — map keyed by `fromStopId` → transport override data.
 *   Routable overrides (osrmMode != null) call OSRM with the specified mode.
 *   Non-routable overrides produce straight-line polylines.
 */
export async function calculateDayRoute(
  stops: RouteStop[],
  defaultMode: 'car' | 'walk' = 'car',
  overrides?: Map<string, LegOverride>,
): Promise<{ legs: RouteLeg[]; stats: RouteStats }> {
  if (stops.length < 2) {
    return {
      legs: [],
      stats: { stops: stops.length, totalDistanceKm: 0, totalTravelMin: 0, totalStayMin: stops.reduce((s, st) => s + st.durationMin, 0) },
    };
  }

  const legs: RouteLeg[] = [];
  let totalDistanceKm = 0;
  let totalTravelMin = 0;
  let totalStayMin = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const override = overrides?.get(from.id);

    let leg: RouteLeg;

    if (override && override.osrmMode) {
      // Routable transport (bus, taxi, car, walk…) — OSRM with overridden mode
      const result = await fetchRouteLeg(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
        override.osrmMode,
      );
      leg = { ...result, fromStopId: from.id, toStopId: to.id, mode: override.visualMode };
    } else if (override && !override.osrmMode) {
      // Non-routable transport (flight, train, ferry…)
      const hasCoords = !!(override.fromCoords && override.toCoords);
      const polyline: [number, number][] = hasCoords
        ? [[override.fromCoords!.lat, override.fromCoords!.lng], [override.toCoords!.lat, override.toCoords!.lng]]
        : [[from.lat, from.lng], [to.lat, to.lng]];

      leg = {
        fromStopId: from.id,
        toStopId: to.id,
        mode: override.visualMode,
        durationMin: override.durationMin ?? 0,
        distanceKm: 0,
        polyline,
        transportLabel: override.label,
        isUnknown: override.durationMin == null,
      };
    } else {
      // No transport between these stops — default OSRM routing
      const result = await fetchRouteLeg(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
        defaultMode,
      );
      leg = { ...result, fromStopId: from.id, toStopId: to.id };
    }

    legs.push(leg);
    totalDistanceKm += leg.distanceKm;
    if (!leg.isUnknown) totalTravelMin += leg.durationMin;
    totalStayMin += from.durationMin;
  }

  // Add last stop's stay duration
  totalStayMin += stops[stops.length - 1].durationMin;

  return {
    legs,
    stats: {
      stops: stops.length,
      totalDistanceKm,
      totalTravelMin,
      totalStayMin,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatDuration(min: number): string {
  const rounded = Math.round(min);
  if (!rounded) return '—';
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)} km`;
}
