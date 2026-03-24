import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSON as GeoJSONType } from 'geojson';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useLanguage } from '@/context/LanguageContext';
import { AppLayout } from '@/components/layout';
import { Slider } from '@/components/ui/slider';
import { loadCountryData, type CountryData } from '@/services/tripLocationService';
import 'leaflet/dist/leaflet.css';

// ── Types ────────────────────────────────────────

interface MonthlyWeather {
  temp_high_c: number;
  temp_low_c: number;
  precipitation_mm: number;
  rain_days: number;
  snow_days: number;
  sunshine_hours: number;
  max_wind_kmh: number;
  dominant_weather: string;
}

interface WeatherRegion {
  name: string;
  name_he: string;
  coordinates: { lat: number; lng: number };
  monthly: Record<string, MonthlyWeather>;
}

interface WeatherData {
  country: string;
  country_he: string;
  country_id: string;
  regions: Record<string, WeatherRegion>;
}

interface InfoBox {
  id: string;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  icon: string;
  color: string;
  weather: MonthlyWeather;
  hasSnowEver: boolean;
}

// ── Weather icon mapping ─────────────────────────

const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️',
  overcast: '☁️',
  drizzle: '🌦️',
  rain: '🌧️',
  snow: '❄️',
  thunderstorm: '⛈️',
  fog: '🌫️',
};

// ── Temperature → color ──────────────────────────

function tempToColor(temp: number): string {
  const clamped = Math.max(-10, Math.min(40, temp));
  const ratio = (clamped + 10) / 50;

  if (ratio < 0.33) {
    const t = ratio / 0.33;
    return `rgb(${Math.round(30 + 50 * t)}, ${Math.round(100 + 155 * t)}, ${Math.round(220 - 20 * t)})`;
  } else if (ratio < 0.66) {
    const t = (ratio - 0.33) / 0.33;
    return `rgb(${Math.round(80 + 175 * t)}, ${Math.round(255 - 80 * t)}, ${Math.round(200 - 180 * t)})`;
  } else {
    const t = (ratio - 0.66) / 0.34;
    return `rgb(${255}, ${Math.round(175 - 135 * t)}, ${Math.round(20 - 20 * t)})`;
  }
}

// ── Collision avoidance ──────────────────────────

const BOX_W = 110;
const BOX_H = 100;
const PADDING = 6;

function resolveCollisions(boxes: InfoBox[]): InfoBox[] {
  if (boxes.length <= 1) return boxes;

  // Work on copies
  const resolved = boxes.map(b => ({ ...b, x: b.anchorX - b.w / 2, y: b.anchorY - b.h / 2 }));

  // Iterative push-apart: run multiple passes
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];

        const overlapX = (a.w / 2 + b.w / 2 + PADDING) - Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
        const overlapY = (a.h / 2 + b.h / 2 + PADDING) - Math.abs((a.y + a.h / 2) - (b.y + b.h / 2));

        if (overlapX > 0 && overlapY > 0) {
          // Push apart along the axis with less overlap
          if (overlapX < overlapY) {
            const pushX = overlapX / 2 + 1;
            if ((a.x + a.w / 2) < (b.x + b.w / 2)) {
              a.x -= pushX;
              b.x += pushX;
            } else {
              a.x += pushX;
              b.x -= pushX;
            }
          } else {
            const pushY = overlapY / 2 + 1;
            if ((a.y + a.h / 2) < (b.y + b.h / 2)) {
              a.y -= pushY;
              b.y += pushY;
            } else {
              a.y += pushY;
              b.y -= pushY;
            }
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return resolved;
}

// ── FitBounds helper ─────────────────────────────

function FitToRegions({ boundaries }: { boundaries: Record<string, GeoJSONType.Geometry> }) {
  const map = useMap();
  useEffect(() => {
    const geometries = Object.values(boundaries);
    if (geometries.length === 0) return;
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geometries.map(g => ({ type: 'Feature' as const, geometry: g, properties: {} })),
    };
    const layer = L.geoJSON(fc);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.05));
    }
  }, [boundaries, map]);
  return null;
}

// ── Map event listener for overlay repositioning ─

function MapMoveTracker({ onMove }: { onMove: () => void }) {
  useMapEvents({
    moveend: onMove,
    zoomend: onMove,
    resize: onMove,
  });
  return null;
}

// ── Weather info overlay (rendered outside Leaflet) ─

function WeatherOverlay({
  regions,
  mapRef,
  month,
  isHe,
}: {
  regions: Array<{
    id: string;
    region: WeatherRegion;
    boundary?: GeoJSONType.Geometry;
    weather: MonthlyWeather;
    hasSnowEver: boolean;
  }>;
  mapRef: L.Map | null;
  month: number;
  isHe: boolean;
}) {
  const [boxes, setBoxes] = useState<InfoBox[]>([]);

  const computePositions = useCallback(() => {
    if (!mapRef) return;

    const raw: InfoBox[] = regions.map(({ id, region, weather, hasSnowEver }) => {
      const avgTemp = (weather.temp_high_c + weather.temp_low_c) / 2;
      const color = tempToColor(avgTemp);
      const name = isHe ? region.name_he : region.name;
      const icon = WEATHER_ICONS[weather.dominant_weather] || '🌤️';
      const pt = mapRef.latLngToContainerPoint([region.coordinates.lat, region.coordinates.lng]);

      return {
        id,
        anchorX: pt.x,
        anchorY: pt.y,
        x: pt.x - BOX_W / 2,
        y: pt.y - BOX_H / 2,
        w: BOX_W,
        h: BOX_H,
        name,
        icon,
        color,
        weather,
        hasSnowEver,
      };
    });

    setBoxes(resolveCollisions(raw));
  }, [mapRef, regions, isHe]);

  // Recompute on mount and when dependencies change
  useEffect(() => {
    computePositions();
  }, [computePositions]);

  // Also expose for MapMoveTracker
  useEffect(() => {
    if (!mapRef) return;
    const handler = () => computePositions();
    mapRef.on('moveend zoomend resize', handler);
    return () => { mapRef.off('moveend zoomend resize', handler); };
  }, [mapRef, computePositions]);

  if (boxes.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[800] overflow-hidden">
      {boxes.map((box) => {
        const w = box.weather;
        return (
          <div
            key={box.id}
            className="absolute pointer-events-auto"
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
            }}
          >
            {/* Connector line from box center to anchor point */}
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: box.w,
                height: box.h,
                overflow: 'visible',
              }}
            >
              <line
                x1={box.anchorX - box.x}
                y1={box.anchorY - box.y}
                x2={box.w / 2}
                y2={box.h / 2}
                stroke="rgba(0,0,0,0.15)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            </svg>

            <div
              className="rounded-lg shadow-md border text-center leading-tight p-1.5"
              style={{
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(4px)',
                borderColor: 'rgba(0, 0, 0, 0.1)',
              }}
            >
              <div className="text-base leading-none">{box.icon}</div>
              <div className="font-bold text-[10px] mt-0.5 truncate text-gray-900">{box.name}</div>
              <div className="font-semibold text-[11px] mt-0.5" style={{ color: box.color }}>
                {Math.round(w.temp_high_c)}° / {Math.round(w.temp_low_c)}°
              </div>
              <div className="text-[9px] text-gray-600 mt-0.5 space-y-px">
                <div>🌧 {Math.round(w.precipitation_mm)}mm · {w.rain_days.toFixed(0)}d</div>
                <div>☀ {Math.round(w.sunshine_hours)}h &nbsp; 💨 {Math.round(w.max_wind_kmh)}km/h</div>
                {box.hasSnowEver && w.snow_days > 0 && (
                  <div>❄ {w.snow_days.toFixed(1)}d</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Month labels ─────────────────────────────────

const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LABELS_HE = ["ינו'", "פבר'", 'מרץ', "אפר'", 'מאי', "יונ'", "יול'", "אוג'", "ספט'", "אוק'", "נוב'", "דצמ'"];

// ── Map instance capture ─────────────────────────

function MapRefCapture({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  return null;
}

// ── Main Component ───────────────────────────────

const WeatherPage = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { language } = useLanguage();
  const isHe = language === 'he';

  const [month, setMonth] = useState(1);
  const [weatherDataMap, setWeatherDataMap] = useState<Record<string, WeatherData>>({});
  const [countryDataMap, setCountryDataMap] = useState<Record<string, CountryData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const countries = activeTrip?.countries || [];
  const monthLabels = isHe ? MONTH_LABELS_HE : MONTH_LABELS_EN;

  const handleMapRef = useCallback((map: L.Map) => setMapInstance(map), []);

  // Load weather + country data
  useEffect(() => {
    if (countries.length === 0) return;
    let cancelled = false;
    setIsLoading(true);

    Promise.all(
      countries.map(async (country) => {
        const [weatherRes, countryData] = await Promise.all([
          fetch(`https://triptomat-media.s3.eu-central-1.amazonaws.com/geodata/countries_weather/${encodeURIComponent(country)}.json`).then(r => r.ok ? r.json() as Promise<WeatherData> : null).catch(() => null),
          loadCountryData(country),
        ]);
        return { country, weather: weatherRes, countryData };
      }),
    ).then((results) => {
      if (cancelled) return;
      const wMap: Record<string, WeatherData> = {};
      const cMap: Record<string, CountryData> = {};
      for (const { country, weather, countryData } of results) {
        if (weather) wMap[country] = weather;
        if (countryData) cMap[country] = countryData;
      }
      setWeatherDataMap(wMap);
      setCountryDataMap(cMap);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [countries.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build boundaries index from country data
  const boundaries = useMemo(() => {
    const merged: Record<string, GeoJSONType.Geometry> = {};
    for (const data of Object.values(countryDataMap)) {
      if (data.boundaries && typeof data.boundaries === 'object') {
        Object.assign(merged, data.boundaries as Record<string, GeoJSONType.Geometry>);
      }
    }
    return merged;
  }, [countryDataMap]);

  // Collect all weather regions with their boundaries
  const regions = useMemo(() => {
    const result: Array<{
      id: string;
      region: WeatherRegion;
      boundary?: GeoJSONType.Geometry;
      weather: MonthlyWeather;
      hasSnowEver: boolean;
    }> = [];

    for (const weatherData of Object.values(weatherDataMap)) {
      for (const [regionId, region] of Object.entries(weatherData.regions)) {
        const weather = region.monthly[String(month)];
        if (!weather) continue;

        const hasSnowEver = Object.values(region.monthly).some(m => m.snow_days > 0);
        result.push({
          id: regionId,
          region,
          boundary: boundaries[regionId],
          weather,
          hasSnowEver,
        });
      }
    }
    return result;
  }, [weatherDataMap, boundaries, month]);

  if (!activeTrip) {
    return <AppLayout hideHero><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  const hasData = regions.length > 0;
  const defaultCenter: [number, number] = [30, 35];

  return (
    <AppLayout hideHero fillHeight>
      <div className="flex flex-col flex-1 min-h-0 gap-2 md:gap-3">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-xl md:text-2xl font-bold">{t('weatherPage.title')}</h2>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {t('common.loading')}...
          </div>
        ) : !hasData ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {t('weatherPage.noData')}
          </div>
        ) : (
          <>
            {/* Map + overlay wrapper */}
            <div ref={mapContainerRef} className="relative rounded-xl overflow-hidden border shadow-sm flex-1 min-h-0" style={{ isolation: 'isolate', touchAction: 'none' }}>
              <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom zoomControl={false}>
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                />
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
                  pane="shadowPane"
                />

                <MapRefCapture onMap={handleMapRef} />
                <FitToRegions boundaries={boundaries} />

                {/* Colored region polygons only — no tooltips */}
                {regions.map(({ id, boundary, weather }) => {
                  if (!boundary) return null;
                  const avgTemp = (weather.temp_high_c + weather.temp_low_c) / 2;
                  const color = tempToColor(avgTemp);

                  return (
                    <GeoJSON
                      key={`${id}-${month}`}
                      data={{ type: 'Feature', geometry: boundary, properties: {} } as GeoJSON.Feature}
                      style={{
                        color,
                        weight: 2.5,
                        fillOpacity: 0.45,
                        fillColor: color,
                      }}
                    />
                  );
                })}

                {/* Regions without boundary: colored circle markers */}
                {regions.filter(r => !r.boundary).map(({ id, region, weather }) => {
                  const avgTemp = (weather.temp_high_c + weather.temp_low_c) / 2;
                  const color = tempToColor(avgTemp);

                  return (
                    <GeoJSON
                      key={`point-${id}-${month}`}
                      data={{
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [region.coordinates.lng, region.coordinates.lat] },
                        properties: {},
                      } as GeoJSON.Feature}
                      pointToLayer={(_, latlng) => L.circleMarker(latlng, {
                        radius: 20,
                        fillColor: color,
                        fillOpacity: 0.4,
                        color,
                        weight: 2,
                      })}
                    />
                  );
                })}
              </MapContainer>

              {/* Info boxes overlay — rendered in React, positioned with collision avoidance */}
              <WeatherOverlay
                regions={regions}
                mapRef={mapInstance}
                month={month}
                isHe={isHe}
              />

              {/* Temperature legend */}
              <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600" dir="ltr">
                  <span>-10°</span>
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: 80,
                      background: `linear-gradient(to right, ${tempToColor(-10)}, ${tempToColor(5)}, ${tempToColor(20)}, ${tempToColor(30)}, ${tempToColor(40)})`,
                    }}
                  />
                  <span>40°</span>
                </div>
              </div>
            </div>

            {/* Month slider — always LTR so direction matches left=Jan right=Dec */}
            <div className="shrink-0 bg-background border rounded-xl px-4 py-3 shadow-sm me-14 md:me-0" dir="ltr">
              <Slider
                value={[month]}
                onValueChange={([v]) => setMonth(v)}
                min={1}
                max={12}
                step={1}
              />
              <div className="flex justify-between mt-2">
                {monthLabels.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => setMonth(i + 1)}
                    className={`text-[10px] md:text-xs transition-colors ${
                      month === i + 1 ? 'text-primary font-bold' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default WeatherPage;
