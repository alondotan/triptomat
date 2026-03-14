import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface SegmentPoint {
  name: string;
  code?: string;
  lat?: number;
  lng?: number;
}

interface TransportMiniMapProps {
  points: SegmentPoint[];
  className?: string;
}

const GEOCODE_CACHE = new Map<string, { lat: number; lng: number } | null>();

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (GEOCODE_CACHE.has(query)) return GEOCODE_CACHE.get(query)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    );
    const data = await res.json();
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      GEOCODE_CACHE.set(query, result);
      return result;
    }
  } catch {
    // ignore
  }
  GEOCODE_CACHE.set(query, null);
  return null;
}

function createStopIcon(label: string, color: string) {
  return new L.DivIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function FitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length === 1) {
      map.setView(coordinates[0], 10);
    } else if (coordinates.length > 1) {
      const bounds = L.latLngBounds(coordinates.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map, coordinates]);
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export function TransportMiniMap({ points, className = '' }: TransportMiniMapProps) {
  const [resolved, setResolved] = useState<({ lat: number; lng: number } | null)[]>([]);

  // Deduplicate points by name for display
  const uniquePoints = useMemo(() => {
    const seen = new Set<string>();
    return points.filter(p => {
      const key = p.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [points]);

  useEffect(() => {
    let cancelled = false;
    async function resolveAll() {
      const results = await Promise.all(
        uniquePoints.map(async p => {
          if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
          if (!p.name.trim()) return null;
          // Try code first (airport/station codes), then name
          const query = p.code ? `${p.code} ${p.name}` : p.name;
          return geocode(query);
        }),
      );
      if (!cancelled) setResolved(results);
    }
    if (uniquePoints.length > 0) resolveAll();
    else setResolved([]);
    return () => { cancelled = true; };
  }, [uniquePoints]);

  const markers = useMemo(() => {
    return uniquePoints
      .map((p, i) => ({ point: p, coords: resolved[i] }))
      .filter((m): m is { point: SegmentPoint; coords: { lat: number; lng: number } } => m.coords != null);
  }, [uniquePoints, resolved]);

  const allCoords = useMemo<[number, number][]>(
    () => markers.map(m => [m.coords.lat, m.coords.lng]),
    [markers],
  );

  if (markers.length === 0) {
    return (
      <div className={`rounded-xl bg-secondary/30 flex items-center justify-center text-xs text-muted-foreground ${className}`}>
        הזן מיקומים כדי לראות מפה
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden relative z-0 ${className}`}>
      <MapContainer
        center={allCoords[0]}
        zoom={5}
        scrollWheelZoom
        dragging
        zoomControl={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <InvalidateSize />
        <FitBounds coordinates={allCoords} />

        {/* Connect markers with a line */}
        {allCoords.length > 1 && (
          <Polyline positions={allCoords} color="#6366f1" weight={3} opacity={0.6} dashArray="8 6" />
        )}

        {markers.map((m, i) => {
          const label = i === 0 ? 'A' : i === markers.length - 1 ? 'B' : String.fromCharCode(65 + i);
          const color = i === 0 ? '#16a34a' : i === markers.length - 1 ? '#dc2626' : '#4f46e5';
          return (
            <Marker
              key={`${m.point.name}-${i}`}
              position={[m.coords.lat, m.coords.lng]}
              icon={createStopIcon(label, color)}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
