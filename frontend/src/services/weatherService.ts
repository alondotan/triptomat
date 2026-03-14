/**
 * Weather service using Open-Meteo API (free, no API key required).
 * Fetches daily forecast data for given coordinates and date range.
 * Open-Meteo supports forecasts up to 16 days ahead.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Maximum number of days ahead that Open-Meteo can forecast. */
export const MAX_FORECAST_DAYS = 16;

// ============================================================
// GEOCODING
// ============================================================

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
}

/** In-memory geocode cache — survives across calls within the same session. */
const geocodeCache = new Map<string, GeoLocation | null>();

/**
 * Geocode a location name to coordinates via Open-Meteo Geocoding API.
 * Results are cached in memory so the same name is never looked up twice.
 */
export async function geocodeLocation(name: string): Promise<GeoLocation | null> {
  const key = name.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  const params = new URLSearchParams({ name: name.trim(), count: '1', language: 'en' });
  const res = await fetch(`${GEOCODING_URL}?${params}`);
  if (!res.ok) {
    geocodeCache.set(key, null);
    return null;
  }

  const json = await res.json();
  if (!json.results?.length) {
    geocodeCache.set(key, null);
    return null;
  }

  const r = json.results[0];
  const loc: GeoLocation = {
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country,
  };
  geocodeCache.set(key, loc);
  return loc;
}

// ============================================================
// WEATHER FORECAST
// ============================================================

export interface DailyWeather {
  date: string;                       // "YYYY-MM-DD"
  temperatureMax: number;             // °C
  temperatureMin: number;             // °C
  precipitationProbability: number;   // 0-100 %
  precipitationSum: number;           // mm
  weatherCode: number;                // WMO weather code
  windSpeedMax: number;               // km/h
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  daily: DailyWeather[];
}

/**
 * Fetch daily weather forecast from Open-Meteo.
 * Returns only the days that fall within the requested range.
 */
export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    start_date: startDate,
    end_date: endDate,
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'weather_code',
      'wind_speed_10m_max',
    ].join(','),
    timezone: 'auto',
  });

  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Open-Meteo error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const d = json.daily;

  const daily: DailyWeather[] = (d.time as string[]).map((date: string, i: number) => ({
    date,
    temperatureMax: d.temperature_2m_max[i],
    temperatureMin: d.temperature_2m_min[i],
    precipitationProbability: d.precipitation_probability_max[i],
    precipitationSum: d.precipitation_sum[i],
    weatherCode: d.weather_code[i],
    windSpeedMax: d.wind_speed_10m_max[i],
  }));

  return {
    latitude: json.latitude,
    longitude: json.longitude,
    daily,
  };
}

// ============================================================
// TRIP-LEVEL WEATHER (geocode + forecast combined)
// ============================================================

export interface DayLocationInput {
  date: string;           // "YYYY-MM-DD"
  locationName: string;   // from itinerary day locationContext or country fallback
}

/** Weather keyed by date string. */
export type WeatherByDate = Map<string, DailyWeather>;

/**
 * Fetch weather for multiple days, each potentially at a different location.
 * Groups days by location, geocodes each unique location once,
 * then fetches weather per location and merges into a date→weather map.
 */
export async function fetchTripWeather(
  days: DayLocationInput[],
): Promise<WeatherByDate> {
  if (!days.length) return new Map();

  // Group dates by location name
  const locationDates = new Map<string, string[]>();
  for (const { date, locationName } of days) {
    const name = locationName.trim().toLowerCase();
    const dates = locationDates.get(name) ?? [];
    dates.push(date);
    locationDates.set(name, dates);
  }

  // Geocode all unique locations in parallel
  const locationNames = [...locationDates.keys()];
  const geoResults = await Promise.all(
    locationNames.map((name) => geocodeLocation(name)),
  );

  // For each geocoded location, fetch weather for its date range
  const result: WeatherByDate = new Map();

  const forecasts = await Promise.all(
    locationNames.map((name, i) => {
      const geo = geoResults[i];
      if (!geo) return null;

      const dates = locationDates.get(name)!.sort();
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      return fetchWeatherForecast(geo.latitude, geo.longitude, startDate, endDate);
    }),
  );

  // Merge all forecasts into a single date→weather map
  for (const forecast of forecasts) {
    if (!forecast) continue;
    for (const day of forecast.daily) {
      result.set(day.date, day);
    }
  }

  return result;
}

/**
 * Map WMO weather code to a human-readable description.
 * See: https://open-meteo.com/en/docs#weathervariables
 */
export function weatherCodeToDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
}

/**
 * Map WMO weather code to an emoji icon.
 */
export function weatherCodeToIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '❓';
}
