import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  weatherCodeToDescription,
  weatherCodeToIcon,
  MAX_FORECAST_DAYS,
  geocodeLocation,
  fetchWeatherForecast,
  fetchTripWeather,
} from "./weatherService";

// ── Pure function tests (no mocking needed) ──────────────────────

describe("weatherCodeToDescription", () => {
  it("returns 'Clear sky' for code 0", () => {
    expect(weatherCodeToDescription(0)).toBe("Clear sky");
  });

  it("returns 'Partly cloudy' for codes 1-3", () => {
    expect(weatherCodeToDescription(1)).toBe("Partly cloudy");
    expect(weatherCodeToDescription(2)).toBe("Partly cloudy");
    expect(weatherCodeToDescription(3)).toBe("Partly cloudy");
  });

  it("returns 'Fog' for codes 4-48", () => {
    expect(weatherCodeToDescription(45)).toBe("Fog");
    expect(weatherCodeToDescription(48)).toBe("Fog");
  });

  it("returns 'Drizzle' for codes 49-57", () => {
    expect(weatherCodeToDescription(51)).toBe("Drizzle");
    expect(weatherCodeToDescription(53)).toBe("Drizzle");
  });

  it("returns 'Rain' for codes 58-67", () => {
    expect(weatherCodeToDescription(61)).toBe("Rain");
    expect(weatherCodeToDescription(65)).toBe("Rain");
  });

  it("returns 'Snow' for codes 68-77", () => {
    expect(weatherCodeToDescription(71)).toBe("Snow");
    expect(weatherCodeToDescription(77)).toBe("Snow");
  });

  it("returns 'Showers' for codes 78-82", () => {
    expect(weatherCodeToDescription(80)).toBe("Showers");
  });

  it("returns 'Snow showers' for codes 83-86", () => {
    expect(weatherCodeToDescription(85)).toBe("Snow showers");
  });

  it("returns 'Thunderstorm' for codes >= 95", () => {
    expect(weatherCodeToDescription(95)).toBe("Thunderstorm");
    expect(weatherCodeToDescription(99)).toBe("Thunderstorm");
  });

  it("returns 'Unknown' for unmatched codes (87-94)", () => {
    expect(weatherCodeToDescription(90)).toBe("Unknown");
  });
});

describe("weatherCodeToIcon", () => {
  it("returns sun for clear sky", () => {
    expect(weatherCodeToIcon(0)).toBe("☀️");
  });

  it("returns partly cloudy icon for codes 1-3", () => {
    expect(weatherCodeToIcon(2)).toBe("⛅");
  });

  it("returns fog icon for fog codes", () => {
    expect(weatherCodeToIcon(45)).toBe("🌫️");
  });

  it("returns rain icon for rain codes", () => {
    expect(weatherCodeToIcon(61)).toBe("🌧️");
  });

  it("returns snow icon for snow codes", () => {
    expect(weatherCodeToIcon(71)).toBe("🌨️");
  });

  it("returns thunderstorm icon for codes >= 95", () => {
    expect(weatherCodeToIcon(95)).toBe("⛈️");
  });

  it("returns question mark for unknown codes", () => {
    expect(weatherCodeToIcon(90)).toBe("❓");
  });
});

describe("MAX_FORECAST_DAYS", () => {
  it("is 16", () => {
    expect(MAX_FORECAST_DAYS).toBe(16);
  });
});

// ── Async function tests with mocked fetch ───────────────────────

describe("geocodeLocation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear the geocode cache between tests by reimporting would be ideal,
    // but we can test caching behavior within a single test instead
  });

  it("returns location from API response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { name: "Tokyo", latitude: 35.68, longitude: 139.77, country: "Japan" },
        ],
      }),
    } as Response);

    const result = await geocodeLocation("Tokyo");
    expect(result).toEqual({
      name: "Tokyo",
      latitude: 35.68,
      longitude: 139.77,
      country: "Japan",
    });
  });

  it("returns null when no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const result = await geocodeLocation("nonexistent-place-xyz123");
    expect(result).toBeNull();
  });

  it("returns null on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const result = await geocodeLocation("error-place-xyz456");
    expect(result).toBeNull();
  });
});

describe("fetchWeatherForecast", () => {
  it("parses Open-Meteo response into structured forecast", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        latitude: 35.68,
        longitude: 139.77,
        daily: {
          time: ["2026-03-14", "2026-03-15"],
          temperature_2m_max: [18.5, 20.1],
          temperature_2m_min: [8.2, 9.4],
          precipitation_probability_max: [10, 45],
          precipitation_sum: [0, 2.3],
          weather_code: [0, 61],
          wind_speed_10m_max: [12, 25],
        },
      }),
    } as Response);

    const result = await fetchWeatherForecast(35.68, 139.77, "2026-03-14", "2026-03-15");

    expect(result.latitude).toBe(35.68);
    expect(result.daily).toHaveLength(2);
    expect(result.daily[0]).toEqual({
      date: "2026-03-14",
      temperatureMax: 18.5,
      temperatureMin: 8.2,
      precipitationProbability: 10,
      precipitationSum: 0,
      weatherCode: 0,
      windSpeedMax: 12,
    });
    expect(result.daily[1].weatherCode).toBe(61);
  });

  it("throws on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    await expect(
      fetchWeatherForecast(0, 0, "2026-01-01", "2026-01-02"),
    ).rejects.toThrow("Open-Meteo error: 429 Too Many Requests");
  });
});

describe("fetchTripWeather", () => {
  it("returns empty map for no days", async () => {
    const result = await fetchTripWeather([]);
    expect(result.size).toBe(0);
  });

  it("groups days by location and fetches weather", async () => {
    // Use a unique location name to avoid geocode cache hits from other tests
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const weatherResponse = {
      ok: true,
      json: async () => ({
        latitude: 40.71,
        longitude: -74.01,
        daily: {
          time: ["2026-04-01", "2026-04-02"],
          temperature_2m_max: [20, 22],
          temperature_2m_min: [10, 12],
          precipitation_probability_max: [5, 15],
          precipitation_sum: [0, 1],
          weather_code: [0, 3],
          wind_speed_10m_max: [8, 12],
        },
      }),
    } as Response;

    // Geocode call (unique name to avoid cache)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ name: "New York", latitude: 40.71, longitude: -74.01, country: "US" }],
      }),
    } as Response);

    // Weather forecast call
    fetchSpy.mockResolvedValueOnce(weatherResponse);

    const result = await fetchTripWeather([
      { date: "2026-04-01", locationName: "new york unique test" },
      { date: "2026-04-02", locationName: "new york unique test" },
    ]);

    expect(result.size).toBe(2);
    expect(result.get("2026-04-01")!.temperatureMax).toBe(20);
    expect(result.get("2026-04-02")!.weatherCode).toBe(3);
  });
});
