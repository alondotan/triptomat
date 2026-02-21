import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTrip } from '@/context/TripContext';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/AppLayout';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createIcon = (color: string) => new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="background: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const hotelIcon = createIcon('hsl(187, 65%, 35%)');
const activityIcon = createIcon('hsl(12, 76%, 61%)');

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

  const markers: { position: [number, number]; label: string; type: string }[] = [];

  // POIs with coordinates
  state.pois.forEach(poi => {
    if (poi.location.coordinates?.lat && poi.location.coordinates?.lng) {
      markers.push({
        position: [poi.location.coordinates.lat, poi.location.coordinates.lng],
        label: poi.name,
        type: poi.category,
      });
    }
  });

  const allCoordinates = markers.map(m => m.position);
  const defaultCenter: [number, number] = allCoordinates.length > 0 ? allCoordinates[0] : [48.8566, 2.3522];

  return (
    <AppLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Trip Map</h2>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="h-[500px] w-full">
              <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {allCoordinates.length > 0 && <FitBounds coordinates={allCoordinates} />}
                {markers.map((marker, idx) => (
                  <Marker
                    key={idx}
                    position={marker.position}
                    icon={marker.type === 'accommodation' ? hotelIcon : activityIcon}
                  >
                    <Popup><div className="font-semibold">{marker.label}</div></Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </CardContent>
        </Card>
        {markers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            Add coordinates to your POIs to see them on the map.
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default MapPage;
