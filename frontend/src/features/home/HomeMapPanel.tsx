import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Geometry } from 'geojson';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { usePOI } from '@/features/poi/POIContext';
import { FitBounds } from '@/features/map/mapUtils';
import type { ChatSuggestion } from './chatSuggestions';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;

// Suggestion is in the plan → solid green circle
const createPlannedIcon = (selected = false) =>
  new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${selected ? 36 : 28}px;height:${selected ? 36 : 28}px;border-radius:50%;background:#16a34a;color:white;box-shadow:0 2px ${selected ? 12 : 6}px rgba(22,163,74,${selected ? 0.6 : 0.4});border:${selected ? 3 : 2}px solid white;font-size:${selected ? 15 : 12}px;">✓</div>`,
    iconSize: [selected ? 36 : 28, selected ? 36 : 28],
    iconAnchor: [selected ? 18 : 14, selected ? 18 : 14],
  });

// Suggestion not yet in the plan → amber outline star
const createSuggestionIcon = (selected = false) =>
  new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${selected ? 36 : 30}px;height:${selected ? 36 : 30}px;border-radius:50%;background:${selected ? '#f59e0b' : 'white'};color:${selected ? 'white' : '#f59e0b'};box-shadow:0 2px ${selected ? 12 : 8}px rgba(245,158,11,${selected ? 0.6 : 0.25});border:${selected ? 3 : 2}px solid ${selected ? 'white' : '#f59e0b'};font-size:${selected ? 17 : 15}px;">✦</div>`,
    iconSize: [selected ? 36 : 30, selected ? 36 : 30],
    iconAnchor: [selected ? 18 : 15, selected ? 18 : 15],
  });

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
  suggestions: ChatSuggestion[];
  countries: string[];
  regionMarkers?: RegionMarker[];
  selectedName: string | null;
  onSelectName: (name: string | null) => void;
  /** When set, show these suggestions instead of live ones (snapshot/preview mode) */
  overrideSuggestions?: ChatSuggestion[];
}

export function HomeMapPanel({ suggestions, countries, regionMarkers = [], selectedName, onSelectName, overrideSuggestions }: HomeMapPanelProps) {
  const activeSuggestions = overrideSuggestions ?? suggestions;
  const { itineraryDays } = useItinerary();
  const { pois } = usePOI();

  // Names of POIs currently in the itinerary (any day)
  const plannedNames = useMemo(() => {
    const itineraryIds = new Set(
      itineraryDays.flatMap(d => d.activities.filter(a => a.type === 'poi').map(a => a.id)),
    );
    return new Set(pois.filter(p => itineraryIds.has(p.id)).map(p => p.name.toLowerCase()));
  }, [itineraryDays, pois]);

  // Nominatim-geocoded coordinates for suggestions that don't have embedded coords
  const [nominatimCoords, setNominatimCoords] = useState<Record<string, [number, number]>>({});
  const geocodedRef = useRef<Set<string>>(new Set());

  // Geocode suggestions that don't already have coordinates
  useEffect(() => {
    const todo = activeSuggestions.filter(s => !s.coordinates && !geocodedRef.current.has(s.id));
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
  }, [activeSuggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build markers from suggestions — use embedded coords first, then Nominatim
  const markers = useMemo(() =>
    activeSuggestions
      .map(s => {
        const pos = s.coordinates ?? nominatimCoords[s.id] ?? null;
        if (!pos) return null;
        return {
          id: s.id,
          name: s.name,
          pos,
          inPlan: plannedNames.has(s.name.toLowerCase()),
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    [activeSuggestions, nominatimCoords, plannedNames],
  );

  const isEmpty = activeSuggestions.length === 0;
  const allCoords = markers.map(m => m.pos);
  const fitCoords = allCoords.length > 0 ? allCoords : (isEmpty ? regionMarkers.flatMap(r => r.pos ? [r.pos] : []) : []);
  const defaultCenter: [number, number] = fitCoords[0] ?? [35.6762, 139.6503];

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border shadow-sm" style={{ isolation: 'isolate' }}>
      <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fitCoords.length > 0 && <FitBounds coordinates={fitCoords} />}

        {markers.map(m => {
          const isSelected = selectedName?.toLowerCase() === m.name.toLowerCase();
          const icon = m.inPlan
            ? createPlannedIcon(isSelected)
            : createSuggestionIcon(isSelected);
          return (
            <Marker
              key={m.id}
              position={m.pos}
              icon={icon}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{ click: () => onSelectName(isSelected ? null : m.name) }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{m.name}</div>
                  {m.inPlan && (
                    <div className="text-[10px] text-green-600 mt-0.5">In schedule</div>
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
  );
}
