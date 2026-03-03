import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Loader2, Car, Footprints, X } from 'lucide-react';
import {
  type RouteLeg,
  type RouteStats,
  type RouteStop,
  type TravelMode,
  MODE_COLORS,
  MODE_DASH,
  formatDuration,
  formatDistance,
} from '@/services/routeService';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;

// ── Marker types ─────────────────────────────────────────────────────────────

export interface MapPOI {
  id: string;
  lat: number;
  lng: number;
  name: string;
  category: string;
  isScheduled: boolean;
}

const POI_COLORS: Record<string, string> = {
  accommodation: '#0e7490',
  eatery: '#ea580c',
  attraction: '#16a34a',
  service: '#7c3aed',
};

const MODE_LABELS: Record<TravelMode, string> = {
  car: 'car',
  walk: 'walk',
  bus: 'transit',
  flight: 'flight',
  train: 'train',
  ferry: 'ferry',
  other_transport: 'other',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function badgeColor(idx: number, total: number): string {
  if (idx === 0) return '#16a34a';
  if (idx === total - 1) return '#dc2626';
  return '#4f46e5';
}

function createNumberedIcon(label: string, color: string, isSelected = false) {
  const size = isSelected ? 36 : 28;
  const border = isSelected ? '3px solid #facc15' : '2px solid #fff';
  const shadow = isSelected ? '0 0 0 3px rgba(250,204,21,0.4), 0 1px 6px rgba(0,0,0,.4)' : '0 1px 4px rgba(0,0,0,.35)';
  return new L.DivIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${isSelected ? 13 : 11}px;font-weight:700;border:${border};box-shadow:${shadow}">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createDotIcon(color: string, opacity: number) {
  return new L.DivIcon({
    className: '',
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25);opacity:${opacity}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// ── FitBounds ────────────────────────────────────────────────────────────────

function FitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, coordinates]);
  return null;
}

// ── InvalidateSize ───────────────────────────────────────────────────────────

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// ── Main Component ───────────────────────────────────────────────────────────

interface RouteMapPanelProps {
  /** All POIs on this day (scheduled + potential) — shown as markers */
  dayPOIs: MapPOI[];
  /** Scheduled stops in order — used for numbered markers + route calculation */
  stops: RouteStop[];
  stopNames: Record<string, string>;
  legs: RouteLeg[];
  stats: RouteStats | null;
  isCalculating: boolean;
  isStale: boolean;
  error: string | null;
  defaultMode: 'car' | 'walk';
  onModeChange: (mode: 'car' | 'walk') => void;
  onCalculate: () => void;
  highlightedLegId: string | null;
  /** ID of the currently selected stop (highlighted marker) */
  selectedStopId?: string | null;
  /** Called when a stop marker is clicked */
  onStopClick?: (stopId: string) => void;
  /** Called to clear the route calculation */
  onReset?: () => void;
}

export function RouteMapPanel({
  dayPOIs,
  stops,
  stopNames,
  legs,
  stats,
  isCalculating,
  isStale,
  error,
  defaultMode,
  onModeChange,
  onCalculate,
  highlightedLegId,
  selectedStopId,
  onStopClick,
  onReset,
}: RouteMapPanelProps) {
  // IDs of scheduled stops — so we don't double-render them as dots
  const scheduledIds = useMemo(() => new Set(stops.map(s => s.id)), [stops]);

  // Potential-only POIs (not in the scheduled route)
  const potentialPOIs = useMemo(
    () => dayPOIs.filter(p => !scheduledIds.has(p.id)),
    [dayPOIs, scheduledIds],
  );

  const allCoords = useMemo<[number, number][]>(() => {
    const coords: [number, number][] = dayPOIs.map(p => [p.lat, p.lng]);
    legs.forEach(l => coords.push(...l.polyline));
    return coords;
  }, [dayPOIs, legs]);

  // Unique modes used in current legs — for legend
  const activeModes = useMemo(() => Array.from(new Set(legs.map(l => l.mode))), [legs]);

  const defaultCenter: [number, number] = allCoords.length > 0 ? allCoords[0] : [48.8566, 2.3522];
  const canCalculate = stops.length >= 2 && !isCalculating;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b bg-muted/30 shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5">
          <Button
            variant={defaultMode === 'car' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => onModeChange('car')}
          >
            <Car size={11} />
          </Button>
          <Button
            variant={defaultMode === 'walk' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => onModeChange('walk')}
          >
            <Footprints size={11} />
          </Button>
        </div>

        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={onCalculate}
          disabled={!canCalculate}
        >
          {isCalculating ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            'Route'
          )}
        </Button>

        {legs.length > 0 && onReset && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
            onClick={onReset}
          >
            <X size={11} />
          </Button>
        )}

        {isStale && legs.length > 0 && (
          <span className="text-[10px] text-amber-600 font-medium">stale</span>
        )}

        {error && (
          <span className="text-[10px] text-destructive font-medium truncate max-w-[120px]">{error}</span>
        )}
      </div>

      {/* Map — z-0 keeps Leaflet's internal z-indices below dialog overlays (z-50) */}
      <div className="flex-1 min-h-0 relative z-0">
        <MapContainer
          center={defaultCenter}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InvalidateSize />
          {allCoords.length > 0 && <FitBounds coordinates={allCoords} />}

          {/* Route polylines */}
          {legs.map((leg, i) => (
            <Polyline
              key={`leg-${i}`}
              positions={leg.polyline}
              color={MODE_COLORS[leg.mode]}
              weight={highlightedLegId === leg.fromStopId ? 8 : 5}
              opacity={highlightedLegId && highlightedLegId !== leg.fromStopId ? 0.3 : 0.85}
              dashArray={MODE_DASH[leg.mode]}
            />
          ))}

          {/* Potential POI markers (dots) */}
          {potentialPOIs.map(poi => (
            <Marker
              key={`pot-${poi.id}`}
              position={[poi.lat, poi.lng]}
              icon={createDotIcon(POI_COLORS[poi.category] ?? '#9ca3af', 0.6)}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">{poi.name}</div>
                  <div className="text-muted-foreground">potential</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Scheduled stop markers (numbered) */}
          {stops.map((stop, i) => {
            const label = i === 0 ? 'S' : i === stops.length - 1 ? 'E' : String(i + 1);
            const color = badgeColor(i, stops.length);
            const isSelected = selectedStopId === stop.id;
            return (
              <Marker
                key={`stop-${stop.id}`}
                position={[stop.lat, stop.lng]}
                icon={createNumberedIcon(label, color, isSelected)}
                eventHandlers={onStopClick ? { click: () => onStopClick(stop.id) } : undefined}
              >
                <Popup>
                  <div className="text-sm font-semibold">{stopNames[stop.id] || `Stop ${i + 1}`}</div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Stats bar + legend */}
      {stats && stats.stops >= 2 && (
        <div className="flex items-center gap-3 px-2 py-1 border-t bg-muted/20 text-[10px] text-muted-foreground shrink-0 flex-wrap">
          <span><strong className="text-foreground">{stats.stops}</strong> stops</span>
          <span><strong className="text-foreground">{formatDistance(stats.totalDistanceKm)}</strong></span>
          <span><strong className="text-foreground">{formatDuration(stats.totalTravelMin)}</strong> travel</span>
          <span><strong className="text-foreground">{formatDuration(stats.totalStayMin)}</strong> stay</span>
          {legs.some(l => l.isUnknown) && (
            <span className="text-amber-500 font-medium">incomplete</span>
          )}
        </div>
      )}
      {activeModes.length > 1 && (
        <div className="flex items-center gap-2.5 px-2 py-0.5 border-t text-[9px] text-muted-foreground shrink-0">
          {activeModes.map(mode => (
            <span key={mode} className="flex items-center gap-1">
              <svg width="18" height="4">
                <line x1="0" y1="2" x2="18" y2="2"
                  stroke={MODE_COLORS[mode]}
                  strokeWidth="2"
                  strokeDasharray={MODE_DASH[mode] || ''}
                />
              </svg>
              {MODE_LABELS[mode]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
