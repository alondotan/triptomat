import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { usePOI } from '@/features/poi/POIContext';
import { useTransport } from '@/features/transport/TransportContext';
import { createPOIIcon, createTransportIcon, POI_COLORS, TRANSPORT_COLORS, FitBounds } from '@/features/map/mapUtils';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;

export function OverviewMap() {
  const { pois } = usePOI();
  const { transportation } = useTransport();

  const poiMarkers = useMemo(() => pois
    .filter(p => p.location.coordinates?.lat && p.location.coordinates?.lng)
    .map(p => ({
      id: p.id,
      position: [p.location.coordinates!.lat, p.location.coordinates!.lng] as [number, number],
      name: p.name,
      category: p.category,
      color: POI_COLORS[p.category] ?? '#64748b',
    })), [pois]);

  const transportData = useMemo(() => {
    const stops: { position: [number, number]; label: string; color: string }[] = [];
    const lines: { positions: [number, number][]; color: string }[] = [];

    transportation.forEach(t => {
      const color = TRANSPORT_COLORS[t.category] ?? TRANSPORT_COLORS.default;
      t.segments.forEach(seg => {
        const fromCoords = seg.from.coordinates;
        const toCoords = seg.to.coordinates;
        if (fromCoords?.lat && fromCoords?.lng) {
          stops.push({ position: [fromCoords.lat, fromCoords.lng], label: seg.from.name, color });
        }
        if (toCoords?.lat && toCoords?.lng) {
          stops.push({ position: [toCoords.lat, toCoords.lng], label: seg.to.name, color });
        }
        if (fromCoords?.lat && fromCoords?.lng && toCoords?.lat && toCoords?.lng) {
          lines.push({
            positions: [[fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]],
            color,
          });
        }
      });
    });
    return { stops, lines };
  }, [transportation]);

  const allCoordinates: [number, number][] = [
    ...poiMarkers.map(m => m.position),
    ...transportData.stops.map(s => s.position),
  ];

  const defaultCenter: [number, number] = allCoordinates.length > 0 ? allCoordinates[0] : [48.8566, 2.3522];

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border shadow-sm" style={{ isolation: 'isolate' }}>
      <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {allCoordinates.length > 0 && <FitBounds coordinates={allCoordinates} />}

        {/* Transport route lines */}
        {transportData.lines.map((line, i) => (
          <Polyline key={i} positions={line.positions} color={line.color} weight={2} dashArray="6 4" opacity={0.6} />
        ))}

        {/* POI markers */}
        {poiMarkers.map(m => (
          <Marker key={`poi-${m.id}`} position={m.position} icon={createPOIIcon(m.color)}>
            <Popup>
              <div className="text-sm font-semibold">{m.name}</div>
            </Popup>
          </Marker>
        ))}

        {/* Transport stop markers */}
        {transportData.stops.map((s, i) => (
          <Marker key={`tr-${i}`} position={s.position} icon={createTransportIcon(s.color)}>
            <Popup>
              <div className="text-sm">{s.label}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
