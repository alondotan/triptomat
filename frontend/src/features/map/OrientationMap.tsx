import { useEffect, useState, useMemo } from 'react';
import { MapContainer, GeoJSON, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSON as GeoJSONType } from 'geojson';
import { loadCountryData, type CountryLocationNode, type CountryData } from '@/features/trip/tripLocationService';
import { geocodeLocation } from '@/features/geodata/weatherService';
import 'leaflet/dist/leaflet.css';

interface OrientationMapProps {
  cityName: string;
  countries: string[];
}

function findCityCoords(
  nodes: CountryLocationNode[],
  name: string,
): { lat: number; lng: number } | null {
  const lower = name.toLowerCase();
  for (const node of nodes) {
    if (node.name.toLowerCase() === lower && node.coordinates) {
      return node.coordinates;
    }
    if (node.children) {
      const found = findCityCoords(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

function FitBoundsToGeoData({ geoData }: { geoData: GeoJSONType.FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.geoJSON(geoData);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [4, 4] });
    }
  }, [map, geoData]);
  return null;
}

export function OrientationMap({ cityName, countries }: OrientationMapProps) {
  const [countryDataList, setCountryDataList] = useState<CountryData[]>([]);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (countries.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(countries.map((c) => loadCountryData(c))).then((results) => {
      if (!cancelled) {
        setCountryDataList(results.filter(Boolean) as CountryData[]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [countries]);

  const geoData = useMemo<GeoJSONType.FeatureCollection | null>(() => {
    const allFeatures: GeoJSONType.Feature[] = [];
    for (const cd of countryDataList) {
      const gd = cd.geoData as GeoJSONType.FeatureCollection | undefined;
      if (gd?.features) allFeatures.push(...gd.features);
    }
    return allFeatures.length > 0
      ? { type: 'FeatureCollection', features: allFeatures }
      : null;
  }, [countryDataList]);

  const cityCoords = useMemo(() => {
    for (const cd of countryDataList) {
      const found = findCityCoords(cd.locations, cityName);
      if (found) return found;
    }
    return null;
  }, [countryDataList, cityName]);

  // Fallback: geocode via Nominatim if not found in tree
  useEffect(() => {
    if (cityCoords || !cityName || loading) return;
    let cancelled = false;
    geocodeLocation(cityName).then((loc) => {
      if (!cancelled && loc) setGeocodedCoords({ lat: loc.latitude, lng: loc.longitude });
    });
    return () => { cancelled = true; };
  }, [cityCoords, cityName, loading]);

  const dotCoords = cityCoords ?? geocodedCoords;

  // Still loading — show placeholder so the user sees something
  if (loading) {
    return (
      <div
        className="absolute bottom-3 left-3 z-[1000] rounded-lg shadow-lg bg-muted/80 flex items-center justify-center"
        style={{ width: 100, height: 72, border: '1px solid rgba(0,0,0,0.15)', pointerEvents: 'none' }}
      >
        <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!geoData) return null;

  return (
    <div
      className="absolute bottom-3 left-3 z-[1000] rounded-lg overflow-hidden shadow-lg"
      style={{ width: 130, height: 96, border: '1.5px solid rgba(0,0,0,0.2)', pointerEvents: 'none' }}
    >
      <MapContainer
        center={[20, 0]}
        zoom={4}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        keyboard={false}
        touchZoom={false}
        boxZoom={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%', background: '#c8d4e0' }}
      >
        <FitBoundsToGeoData geoData={geoData} />
        <GeoJSON
          key={countries.join(',')}
          data={geoData}
          style={{ color: '#aaa', weight: 0.5, fillColor: '#ffffff', fillOpacity: 1 }}
        />
        {dotCoords && (
          <CircleMarker
            center={[dotCoords.lat, dotCoords.lng]}
            radius={5}
            pathOptions={{ color: '#991b1b', fillColor: '#dc2626', fillOpacity: 1, weight: 1.5 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
