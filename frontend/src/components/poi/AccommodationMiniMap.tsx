import { MapContainer, TileLayer, Marker, GeoJSON, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

const markerIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:#0e7490;width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const poiMarkerIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:#f97316;width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function RecenterMap({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [map, lat, lng, zoom]);
  return null;
}

/** Fit map to boundary + optional markers */
function FitAll({ geojson, markers }: { geojson?: GeoJSON.GeoJsonObject; markers?: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    let bounds: L.LatLngBounds | null = null;
    if (geojson) {
      try {
        const layer = L.geoJSON(geojson);
        const geoBounds = layer.getBounds();
        if (geoBounds.isValid()) bounds = geoBounds;
      } catch { /* ignore malformed geojson */ }
    }
    if (markers && markers.length > 0) {
      const markerBounds = L.latLngBounds(markers.map(m => [m.lat, m.lng] as L.LatLngTuple));
      if (markerBounds.isValid()) {
        bounds = bounds ? bounds.extend(markerBounds) : markerBounds;
      }
    }
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [map, geojson, markers]);
  return null;
}

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
}

interface AccommodationMiniMapProps {
  coordinates?: { lat: number; lng: number };
  className?: string;
  zoom?: number;
  /** GeoJSON boundary to render as a polygon overlay */
  boundary?: GeoJSON.GeoJsonObject;
  /** Additional POI markers to show on the map */
  markers?: MapMarker[];
}

export function AccommodationMiniMap({ coordinates, className = '', zoom = 15, boundary, markers = [] }: AccommodationMiniMapProps) {
  if (!coordinates) return null;

  const hasMarkers = markers.length > 0;
  const hasBoundary = !!boundary;

  return (
    <div className={`rounded-xl overflow-hidden ${className}`}>
      <MapContainer
        center={[coordinates.lat, coordinates.lng]}
        zoom={zoom}
        scrollWheelZoom={true}
        dragging={true}
        zoomControl={true}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* Center marker only when no boundary and no POI markers */}
        {!hasBoundary && !hasMarkers && <Marker position={[coordinates.lat, coordinates.lng]} icon={markerIcon} />}
        {/* POI markers */}
        {markers.map((m, i) => (
          <Marker key={`poi-${i}-${m.lat}-${m.lng}`} position={[m.lat, m.lng]} icon={poiMarkerIcon}>
            {m.label && <Tooltip direction="top" offset={[0, -10]} permanent={false}>{m.label}</Tooltip>}
          </Marker>
        ))}
        {/* Boundary polygon */}
        {hasBoundary && (
          <GeoJSON
            key={JSON.stringify(coordinates)}
            data={boundary}
            style={{ color: '#0e7490', weight: 2, fillColor: '#0e7490', fillOpacity: 0.08 }}
          />
        )}
        {/* Fitting: boundary+markers, boundary only, markers only, or just recenter */}
        {(hasBoundary || hasMarkers) ? (
          <FitAll geojson={boundary} markers={hasMarkers ? markers : undefined} />
        ) : (
          <RecenterMap lat={coordinates.lat} lng={coordinates.lng} zoom={zoom} />
        )}
      </MapContainer>
    </div>
  );
}
