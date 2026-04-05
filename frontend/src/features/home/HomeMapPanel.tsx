import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Geometry } from 'geojson';
import { FitBounds } from '@/features/map/mapUtils';
import { POIDetailDialog } from '@/features/poi/POIDetailDialog';
import type { PointOfInterest } from '@/types/trip';
import type { PanelItem } from './panelItems';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;

// Category → color (matches ItineraryTree color scheme)
const CATEGORY_COLORS: Record<string, string> = {
  attraction: '#16a34a',     // green-600
  eatery: '#f97316',         // orange-500
  accommodation: '#3b82f6',  // blue-500
  service: '#a855f7',        // purple-500
};
const DEFAULT_COLOR = '#f59e0b'; // amber-500 for unknown/temporary

// Inline Lucide SVG paths per category (same icons as ItineraryTree)
const CATEGORY_SVG: Record<string, string> = {
  attraction: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  eatery: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
  accommodation: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  service: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
};
const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;

function createCategoryIcon(category: string | undefined, selected: boolean) {
  const color = CATEGORY_COLORS[category ?? ''] ?? DEFAULT_COLOR;
  const svg = CATEGORY_SVG[category ?? ''] ?? DEFAULT_SVG;
  const size = selected ? 36 : 30;
  const shadow = selected ? `0 2px 12px ${color}99` : `0 2px 8px ${color}55`;
  const borderW = selected ? 3 : 2;
  return new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:${shadow};border:${borderW}px solid white;">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
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

interface HomeMapPanelProps {
  items: PanelItem[];
  countries: string[];
  regionMarkers?: RegionMarker[];
  selectedName: string | null;
  onSelectName: (name: string | null) => void;
}

export function HomeMapPanel({ items, countries, regionMarkers = [], selectedName, onSelectName }: HomeMapPanelProps) {
  const [dialogPOI, setDialogPOI] = useState<PointOfInterest | null>(null);

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

  const isEmpty = items.length === 0;
  const allCoords = markers.map(m => m.pos);
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
            const icon = createCategoryIcon(m.category, isSelected);
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
