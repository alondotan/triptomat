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

const LOCATION_CATEGORY_ICON: Record<string, string> = {
  attraction: 'place',
  eatery: 'restaurant',
  service: 'build',
};

export const createLocationMarkerIcon = (
  index: number,
  cityName: string,
  nightsLabel: string,
  attractions?: Array<{ name: string; category: string }>,
) => {
  const color = LOCATION_MARKER_COLOR;
  const circleSz = 36;
  const leftW = Math.max(cityName.length * 7 + 16, 72);
  const leftH = circleSz + 4 + 32; // circle + gap + label card

  const items = (attractions ?? []).slice(0, 3);
  const rightW = items.length > 0 ? 112 : 0;
  const colGap = items.length > 0 ? 6 : 0;
  const rightH = items.length > 0 ? 4 + items.length * 20 + Math.max(0, items.length - 1) * 3 : 0;
  const totalW = leftW + colGap + rightW;
  const totalH = Math.max(leftH, rightH);

  const attrHtml = items.map(a => {
    const icon = LOCATION_CATEGORY_ICON[a.category] ?? 'location_on';
    const label = a.name.length > 14 ? a.name.slice(0, 13) + '…' : a.name;
    return `<div style="display:flex;align-items:center;gap:3px;background:white;border-radius:5px;padding:2px 6px;box-shadow:0 1px 4px rgba(0,0,0,0.15);white-space:nowrap;overflow:hidden;"><span class="material-symbols-outlined" style="font-size:11px;color:${color};flex-shrink:0;">${icon}</span><span style="font-size:10px;font-weight:500;color:#1e293b;">${label}</span></div>`;
  }).join('');

  const html = `<div style="display:inline-flex;align-items:flex-start;gap:${colGap}px;">
    <div style="display:flex;flex-direction:column;align-items:center;width:${leftW}px;">
      <div style="width:${circleSz}px;height:${circleSz}px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.35);border:2.5px solid white;font-size:16px;font-weight:700;font-family:sans-serif;flex-shrink:0;">${index}</div>
      <div style="margin-top:4px;background:white;border-radius:6px;padding:2px 6px;box-shadow:0 2px 6px rgba(0,0,0,0.18);text-align:center;line-height:1.2;max-width:${leftW - 4}px;">
        <div style="font-size:11px;font-weight:600;color:#1e293b;white-space:nowrap;font-family:sans-serif;overflow:hidden;text-overflow:ellipsis;">${cityName}</div>
        <div style="font-size:10px;color:#64748b;font-family:sans-serif;">${nightsLabel}</div>
      </div>
    </div>
    ${items.length > 0 ? `<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">${attrHtml}</div>` : ''}
  </div>`;

  return new L.DivIcon({
    className: '',
    html,
    iconSize: [totalW, totalH],
    iconAnchor: [leftW / 2, circleSz / 2],
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
