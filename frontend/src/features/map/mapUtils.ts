import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export const createPOIIcon = (color: string, materialIcon?: string, selected = false) => {
  const size = selected ? 36 : 28;
  const fontSize = selected ? 20 : 16;
  const shadow = selected ? `0 2px 12px ${color}99` : '0 2px 6px rgba(0,0,0,0.3)';
  const borderW = selected ? 3 : 2;
  return new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};color:white;box-shadow:${shadow};border:${borderW}px solid white;">
    <span class="material-symbols-outlined" style="font-size:${fontSize}px;">${materialIcon || 'location_on'}</span>
  </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

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

export const LOCATION_MARKER_COLOR = '#4f46e5';

export const createLocationMarkerIcon = (index: number, cityName: string, nightsLabel: string) => {
  const color = LOCATION_MARKER_COLOR;
  const circleSz = 36;
  const w = Math.max(cityName.length * 7 + 16, 72);
  const totalH = circleSz + 4 + 32;
  const html = `<div style="display:flex;flex-direction:column;align-items:center;width:${w}px;">
    <div style="width:${circleSz}px;height:${circleSz}px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.35);border:2.5px solid white;font-size:16px;font-weight:700;font-family:sans-serif;">${index}</div>
    <div style="margin-top:4px;background:white;border-radius:6px;padding:2px 6px;box-shadow:0 2px 6px rgba(0,0,0,0.18);text-align:center;line-height:1.2;max-width:${w - 4}px;">
      <div style="font-size:11px;font-weight:600;color:#1e293b;white-space:nowrap;font-family:sans-serif;overflow:hidden;text-overflow:ellipsis;">${cityName}</div>
      <div style="font-size:10px;color:#64748b;font-family:sans-serif;">${nightsLabel}</div>
    </div>
  </div>`;
  return new L.DivIcon({
    className: '',
    html,
    iconSize: [w, totalH],
    iconAnchor: [w / 2, circleSz / 2],
  });
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
