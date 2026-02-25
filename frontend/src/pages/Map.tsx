import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTrip } from '@/context/TripContext';
import { AppLayout } from '@/components/AppLayout';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;

const createDotIcon = (color: string, size = 22) => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});

const createTransportIcon = (color: string) => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:16px;height:16px;border-radius:3px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const POI_COLORS: Record<string, string> = {
  accommodation: '#0e7490',
  eatery: '#ea580c',
  attraction: '#16a34a',
  service: '#7c3aed',
};

const TRANSPORT_COLORS: Record<string, string> = {
  flight: '#1d4ed8',
  train: '#b45309',
  ferry: '#0891b2',
  bus: '#65a30d',
  taxi: '#d97706',
  car_rental: '#6b7280',
  default: '#64748b',
};

const LEGEND_ITEMS = [
  { color: POI_COLORS.accommodation, label: 'Accommodation' },
  { color: POI_COLORS.eatery, label: 'Eatery' },
  { color: POI_COLORS.attraction, label: 'Attraction' },
  { color: POI_COLORS.service, label: 'Service' },
  { color: '#1d4ed8', label: 'Transport stop', square: true },
];

function FitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, coordinates]);
  return null;
}

const MapPage = () => {
  const { state } = useTrip();

  if (!state.activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  // ── POI markers ──────────────────────────────────────────────
  const poiMarkers = state.pois
    .filter(p => p.location.coordinates?.lat && p.location.coordinates?.lng)
    .map(p => ({
      position: [p.location.coordinates!.lat, p.location.coordinates!.lng] as [number, number],
      name: p.name,
      sub: [p.subCategory || p.category, p.location.city].filter(Boolean).join(' · '),
      status: p.status,
      color: POI_COLORS[p.category] ?? '#64748b',
    }));

  // ── Transport markers & route lines ──────────────────────────
  type TransportStop = {
    position: [number, number];
    label: string;
    route: string;
    color: string;
  };
  type RouteLine = { positions: [number, number][]; color: string };

  const transportStops: TransportStop[] = [];
  const routeLines: RouteLine[] = [];

  state.transportation.forEach(t => {
    const color = TRANSPORT_COLORS[t.category] ?? TRANSPORT_COLORS.default;
    t.segments.forEach(seg => {
      const fromCoords = seg.from.coordinates;
      const toCoords = seg.to.coordinates;
      const route = `${seg.from.name} → ${seg.to.name}`;
      const label = `${t.category.charAt(0).toUpperCase() + t.category.slice(1)}: ${route}`;

      if (fromCoords?.lat && fromCoords?.lng) {
        transportStops.push({
          position: [fromCoords.lat, fromCoords.lng],
          label,
          route,
          color,
        });
      }
      if (toCoords?.lat && toCoords?.lng) {
        transportStops.push({
          position: [toCoords.lat, toCoords.lng],
          label,
          route,
          color,
        });
      }
      if (fromCoords?.lat && fromCoords?.lng && toCoords?.lat && toCoords?.lng) {
        routeLines.push({
          positions: [
            [fromCoords.lat, fromCoords.lng],
            [toCoords.lat, toCoords.lng],
          ],
          color,
        });
      }
    });
  });

  const allCoordinates: [number, number][] = [
    ...poiMarkers.map(m => m.position),
    ...transportStops.map(s => s.position),
  ];

  const defaultCenter: [number, number] = allCoordinates.length > 0 ? allCoordinates[0] : [48.8566, 2.3522];
  const totalOnMap = poiMarkers.length + transportStops.length;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Trip Map</h2>
          <span className="text-sm text-muted-foreground">{totalOnMap} items on map</span>
        </div>

        <div className="relative rounded-xl overflow-hidden border shadow-sm" style={{ height: 520 }}>
          <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {allCoordinates.length > 0 && <FitBounds coordinates={allCoordinates} />}

            {/* Route lines */}
            {routeLines.map((line, i) => (
              <Polyline
                key={i}
                positions={line.positions}
                color={line.color}
                weight={2}
                dashArray="6 4"
                opacity={0.6}
              />
            ))}

            {/* POI markers */}
            {poiMarkers.map((m, i) => (
              <Marker key={`poi-${i}`} position={m.position} icon={createDotIcon(m.color)}>
                <Popup>
                  <div className="text-sm space-y-0.5">
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-muted-foreground text-xs">{m.sub}</div>
                    <div className="text-xs capitalize" style={{ color: m.color }}>{m.status}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Transport stop markers */}
            {transportStops.map((s, i) => (
              <Marker key={`tr-${i}`} position={s.position} icon={createTransportIcon(s.color)}>
                <Popup>
                  <div className="text-sm space-y-0.5">
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.route}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow text-xs space-y-1.5">
            {LEGEND_ITEMS.map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div style={{
                  background: item.color,
                  width: item.square ? 12 : 14,
                  height: item.square ? 12 : 14,
                  borderRadius: item.square ? 3 : '50%',
                  border: '2px solid white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  flexShrink: 0,
                }} />
                <span className="text-gray-700">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {totalOnMap === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            No items with coordinates found. Add location data to your POIs or transportation.
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default MapPage;
