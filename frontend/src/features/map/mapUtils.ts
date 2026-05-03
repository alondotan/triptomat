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

export const createSleepMarkerIcon = (label: string) => {
  const html = `<div style="position:relative;width:40px;height:52px;">
    <div style="position:absolute;top:0;left:0;width:40px;height:40px;border-radius:50%;background:#4338ca;color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.4);border:2.5px solid white;">
      <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">hotel</span>
    </div>
    <div style="position:absolute;top:-5px;left:26px;background:#1e1b4b;color:white;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;border:1.5px solid white;white-space:nowrap;line-height:1.5;font-family:sans-serif;">${label}</div>
    <div style="position:absolute;bottom:0;left:13px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid #4338ca;"></div>
  </div>`;
  return new L.DivIcon({
    className: '',
    html,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
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
