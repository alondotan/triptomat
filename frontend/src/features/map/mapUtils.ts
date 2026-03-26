import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export const createPOIIcon = (color: string, materialIcon?: string) => new L.DivIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${color};color:white;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">
    <span class="material-symbols-outlined" style="font-size:16px;">${materialIcon || 'location_on'}</span>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const createTransportIcon = (color: string) => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:16px;height:16px;border-radius:3px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export const POI_COLORS: Record<string, string> = {
  accommodation: '#0e7490',
  eatery: '#ea580c',
  attraction: '#16a34a',
  service: '#7c3aed',
};

export const TRANSPORT_COLORS: Record<string, string> = {
  flight: '#1d4ed8',
  train: '#b45309',
  ferry: '#0891b2',
  bus: '#65a30d',
  taxi: '#d97706',
  car_rental: '#6b7280',
  default: '#64748b',
};

export function FitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, coordinates]);
  return null;
}
