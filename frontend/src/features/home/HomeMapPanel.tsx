import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Geometry } from 'geojson';
import { createPOIIcon, createSleepMarkerIcon, POI_COLORS, FitBounds } from '@/features/map/mapUtils';
import { getSubCategoryEntry, loadSubCategoryConfig } from '@/shared/lib/subCategoryConfig';
import { POIDetailDialog } from '@/features/poi/POIDetailDialog';
import type { PointOfInterest } from '@/types/trip';
import type { PanelItem } from './panelItems';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;

// Fallback Material icon per category (used when no placeType is available)
const CATEGORY_MATERIAL_ICON: Record<string, string> = {
  attraction: 'place',
  eatery: 'restaurant',
  accommodation: 'hotel',
  service: 'build',
};

function getMaterialIcon(placeType?: string, category?: string): string {
  if (placeType) {
    const entry = getSubCategoryEntry(placeType);
    if (entry?.icon) return entry.icon;
  }
  return CATEGORY_MATERIAL_ICON[category ?? ''] ?? 'location_on';
}

function getCategoryColor(category?: string): string {
  return POI_COLORS[category ?? ''] ?? '#f59e0b';
}

async function geocodeByName(name: string, countries: string[]): Promise<[number, number] | null> {
  const q = encodeURIComponent(countries.length ? `${name} ${countries[0]}` : name);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Triptomat/1.0' } },
    );
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch { /* ignore */ }
  return null;
}

const regionStyle = {
  color: '#6366f1',
  weight: 2,
  opacity: 0.75,
  fillColor: '#6366f1',
  fillOpacity: 0.12,
};

interface RegionMarker { id: string; name: string; pos?: [number, number]; boundary?: Geometry }

export interface SleepSegment {
  poiId: string;
  name: string;
  coordinates?: [number, number];
  /** One or more day ranges — multiple when the same location appears non-consecutively */
  ranges: Array<{ start: number; end: number }>;
}

function formatRanges(ranges: SleepSegment['ranges']): string {
  return ranges.map(r => r.start === r.end ? String(r.start) : `${r.start}-${r.end}`).join(', ');
}

interface HomeMapPanelProps {
  items: PanelItem[];
  countries: string[];
  regionMarkers?: RegionMarker[];
  selectedName: string | null;
  onSelectName: (name: string | null) => void;
  sleepSegments?: SleepSegment[];
}

export function HomeMapPanel({ items, countries, regionMarkers = [], selectedName, onSelectName, sleepSegments = [] }: HomeMapPanelProps) {
  const [dialogPOI, setDialogPOI] = useState<PointOfInterest | null>(null);
  // Force re-render once sub-category config is loaded so marker icons update
  const [, setConfigLoaded] = useState(false);
  useEffect(() => {
    loadSubCategoryConfig().then(() => setConfigLoaded(true));
  }, []);

  // Nominatim-geocoded coordinates for items that don't have embedded coords
  const [nominatimCoords, setNominatimCoords] = useState<Record<string, [number, number]>>({});
  const geocodedRef = useRef<Set<string>>(new Set());

  // Geocode items that don't already have coordinates
  useEffect(() => {
    const todo = items.filter(s => !s.coordinates && !geocodedRef.current.has(s.id));
    if (!todo.length) return;
    let cancelled = false;
    (async () => {
      for (const s of todo) {
        if (cancelled) break;
        geocodedRef.current.add(s.id);
        const result = await geocodeByName(s.name, countries);
        if (cancelled) break;
        if (result) setNominatimCoords(prev => ({ ...prev, [s.id]: result }));
        await new Promise(r => setTimeout(r, 1100)); // Nominatim ≤1 req/s
      }
    })();
    return () => { cancelled = true; };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build markers from items — use embedded coords first, then Nominatim
  const markers = useMemo(() =>
    items
      .map(s => {
        const pos = s.coordinates ?? nominatimCoords[s.id] ?? null;
        if (!pos) return null;
        return { id: s.id, name: s.name, pos, inPlan: !!s.poiId, category: s.category, poi: s.poi };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    [items, nominatimCoords],
  );

  // Nominatim-geocoded coordinates for sleep segments without embedded coords
  const [sleepCoords, setSleepCoords] = useState<Record<string, [number, number]>>({});
  const geocodedSleepRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const todo = sleepSegments.filter(s => !s.coordinates && !geocodedSleepRef.current.has(s.poiId));
    if (!todo.length) return;
    let cancelled = false;
    (async () => {
      for (const s of todo) {
        if (cancelled) break;
        geocodedSleepRef.current.add(s.poiId);
        const result = await geocodeByName(s.name, countries);
        if (cancelled) break;
        if (result) setSleepCoords(prev => ({ ...prev, [s.poiId]: result }));
        await new Promise(r => setTimeout(r, 1100));
      }
    })();
    return () => { cancelled = true; };
  }, [sleepSegments]); // eslint-disable-line react-hooks/exhaustive-deps

  const sleepMarkers = useMemo(() =>
    sleepSegments
      .map(s => {
        const pos = s.coordinates ?? sleepCoords[s.poiId] ?? null;
        if (!pos) return null;
        const label = formatRanges(s.ranges);
        return { poiId: s.poiId, name: s.name, label, pos };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    [sleepSegments, sleepCoords],
  );

  const isEmpty = items.length === 0;
  const allCoords = [...markers.map(m => m.pos), ...sleepMarkers.map(m => m.pos)];
  const fitCoords = allCoords.length > 0 ? allCoords : (isEmpty ? regionMarkers.flatMap(r => r.pos ? [r.pos] : []) : []);
  const defaultCenter: [number, number] = fitCoords[0] ?? [35.6762, 139.6503];

  return (
    <>
      <div className="h-full w-full rounded-xl overflow-hidden border shadow-sm" style={{ isolation: 'isolate' }}>
        <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {fitCoords.length > 0 && <FitBounds coordinates={fitCoords} />}

          {markers.map(m => {
            const isSelected = selectedName?.toLowerCase() === m.name.toLowerCase();
            const placeType = m.poi?.placeType || m.poi?.activityType;
            const materialIcon = getMaterialIcon(placeType, m.category);
            const color = getCategoryColor(m.category);
            const icon = createPOIIcon(color, materialIcon, isSelected);
            return (
              <Marker
                key={m.id}
                position={m.pos}
                icon={icon}
                zIndexOffset={isSelected ? 1000 : 0}
                eventHandlers={{
                  click: () => onSelectName(isSelected ? null : m.name),
                  dblclick: (e) => {
                    e.originalEvent?.preventDefault();
                    if (m.poi) setDialogPOI(m.poi);
                  },
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">{m.name}</div>
                    {m.inPlan && (
                      <div className="text-[10px] text-green-600 mt-0.5">In schedule</div>
                    )}
                    {m.poi && (
                      <button
                        className="text-[10px] text-primary underline mt-1"
                        onClick={() => setDialogPOI(m.poi!)}
                      >
                        Open details
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {sleepMarkers.map(m => (
            <Marker
              key={`sleep-${m.poiId}`}
              position={m.pos}
              icon={createSleepMarkerIcon(m.label)}
              zIndexOffset={500}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Days {m.label}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {isEmpty && regionMarkers.map(r => r.boundary ? (
            <GeoJSON key={r.id} data={r.boundary} style={regionStyle}>
              <Tooltip sticky>{r.name}</Tooltip>
            </GeoJSON>
          ) : null)}
        </MapContainer>
      </div>

      <POIDetailDialog
        poi={dialogPOI ?? undefined}
        open={!!dialogPOI}
        onOpenChange={(open) => { if (!open) setDialogPOI(null); }}
      />
    </>
  );
}
