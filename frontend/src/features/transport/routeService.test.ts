import { describe, it, expect, vi } from "vitest";
import {
  formatDuration,
  formatDistance,
  TRANSPORT_CATEGORY_CONFIG,
  MODE_COLORS,
  MODE_DASH,
  fetchRouteLeg,
  calculateDayRoute,
  type TravelMode,
  type RouteStop,
  type LegOverride,
} from "./routeService";

// ── Pure function tests ──────────────────────────────────────────

describe("formatDuration", () => {
  it("returns dash for 0", () => {
    expect(formatDuration(0)).toBe("—");
  });

  it("shows minutes for < 60", () => {
    expect(formatDuration(45)).toBe("45 min");
  });

  it("shows hours for exact hours", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("shows hours and minutes for mixed", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("rounds fractional minutes", () => {
    expect(formatDuration(0.4)).toBe("—"); // rounds to 0
    expect(formatDuration(59.6)).toBe("1h");  // rounds to 60
  });

  it("pads single-digit minutes", () => {
    expect(formatDuration(65)).toBe("1h 05m");
  });
});

describe("formatDistance", () => {
  it("shows meters for < 1 km", () => {
    expect(formatDistance(0.5)).toBe("500m");
  });

  it("shows km with one decimal for >= 1 km", () => {
    expect(formatDistance(3.456)).toBe("3.5 km");
  });

  it("shows meters for very short distances", () => {
    expect(formatDistance(0.05)).toBe("50m");
  });

  it("shows km for exactly 1 km", () => {
    expect(formatDistance(1)).toBe("1.0 km");
  });
});

describe("TRANSPORT_CATEGORY_CONFIG", () => {
  it("classifies flights as non-routable", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.airplane.osrmMode).toBeNull();
    expect(TRANSPORT_CATEGORY_CONFIG.airplane.visualMode).toBe("flight");
  });

  it("classifies trains as non-routable", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.train.osrmMode).toBeNull();
    expect(TRANSPORT_CATEGORY_CONFIG.train.visualMode).toBe("train");
  });

  it("classifies ferry as non-routable", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.ferry.osrmMode).toBeNull();
    expect(TRANSPORT_CATEGORY_CONFIG.ferry.visualMode).toBe("ferry");
  });

  it("classifies taxi as car-routable", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.taxi.osrmMode).toBe("car");
    expect(TRANSPORT_CATEGORY_CONFIG.taxi.visualMode).toBe("car");
  });

  it("classifies bus as car-routable (road approximation)", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.bus.osrmMode).toBe("car");
    expect(TRANSPORT_CATEGORY_CONFIG.bus.visualMode).toBe("bus");
  });

  it("classifies walk as walk-routable", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.walk.osrmMode).toBe("walk");
    expect(TRANSPORT_CATEGORY_CONFIG.walk.visualMode).toBe("walk");
  });

  it("classifies bicycle as walk-routable", () => {
    expect(TRANSPORT_CATEGORY_CONFIG.bicycle.osrmMode).toBe("walk");
  });
});

describe("MODE_COLORS", () => {
  it("has a color for every travel mode", () => {
    const modes: TravelMode[] = ["car", "walk", "bus", "flight", "train", "ferry", "other_transport"];
    for (const mode of modes) {
      expect(MODE_COLORS[mode]).toBeDefined();
      expect(MODE_COLORS[mode]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("MODE_DASH", () => {
  it("has solid lines (undefined) for routable modes", () => {
    expect(MODE_DASH.car).toBeUndefined();
    expect(MODE_DASH.walk).toBeUndefined();
    expect(MODE_DASH.bus).toBeUndefined();
  });

  it("has dashed patterns for non-routable modes", () => {
    expect(MODE_DASH.flight).toBeDefined();
    expect(MODE_DASH.train).toBeDefined();
    expect(MODE_DASH.ferry).toBeDefined();
  });
});

// ── Async function tests with mocked fetch ───────────────────────

describe("fetchRouteLeg", () => {
  it("parses OSRM response correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            distance: 5000, // meters
            duration: 600, // seconds
            geometry: {
              coordinates: [
                [139.77, 35.68],
                [139.78, 35.69],
              ],
            },
          },
        ],
      }),
    } as Response);

    const result = await fetchRouteLeg(
      { lat: 35.68, lng: 139.77 },
      { lat: 35.69, lng: 139.78 },
      "car",
    );

    expect(result.mode).toBe("car");
    expect(result.distanceKm).toBe(5); // 5000m / 1000
    expect(result.durationMin).toBe(10); // 600s / 60
    // Coordinates should be flipped to [lat, lng] for Leaflet
    expect(result.polyline[0]).toEqual([35.68, 139.77]);
  });

  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    await expect(
      fetchRouteLeg({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }),
    ).rejects.toThrow("OSRM HTTP 503");
  });

  it("throws when no routes found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "NoRoute", message: "No route found", routes: [] }),
    } as Response);

    await expect(
      fetchRouteLeg({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }),
    ).rejects.toThrow("No route found");
  });
});

describe("calculateDayRoute", () => {
  it("returns empty legs for single stop", async () => {
    const stops: RouteStop[] = [{ id: "a", lat: 0, lng: 0, durationMin: 30 }];
    const { legs, stats } = await calculateDayRoute(stops);

    expect(legs).toHaveLength(0);
    expect(stats.stops).toBe(1);
    expect(stats.totalStayMin).toBe(30);
    expect(stats.totalDistanceKm).toBe(0);
  });

  it("returns empty legs for no stops", async () => {
    const { legs, stats } = await calculateDayRoute([]);
    expect(legs).toHaveLength(0);
    expect(stats.stops).toBe(0);
  });

  it("calculates route with non-routable override (flight)", async () => {
    const stops: RouteStop[] = [
      { id: "a", lat: 35.68, lng: 139.77, durationMin: 60 },
      { id: "b", lat: 52.52, lng: 13.40, durationMin: 120 },
    ];

    const overrides = new Map<string, LegOverride>([
      ["a", {
        visualMode: "flight",
        osrmMode: null,
        durationMin: 720,
        label: "JL 407",
      }],
    ]);

    const { legs, stats } = await calculateDayRoute(stops, "car", overrides);

    expect(legs).toHaveLength(1);
    expect(legs[0].mode).toBe("flight");
    expect(legs[0].durationMin).toBe(720);
    expect(legs[0].transportLabel).toBe("JL 407");
    expect(legs[0].distanceKm).toBe(0);
    expect(legs[0].polyline).toEqual([
      [35.68, 139.77],
      [52.52, 13.40],
    ]);
    expect(stats.totalTravelMin).toBe(720);
    expect(stats.totalStayMin).toBe(180); // 60 + 120
  });

  it("marks non-routable leg as unknown when no duration", async () => {
    const stops: RouteStop[] = [
      { id: "a", lat: 0, lng: 0, durationMin: 0 },
      { id: "b", lat: 1, lng: 1, durationMin: 0 },
    ];

    const overrides = new Map<string, LegOverride>([
      ["a", { visualMode: "train", osrmMode: null }],
    ]);

    const { legs, stats } = await calculateDayRoute(stops, "car", overrides);

    expect(legs[0].isUnknown).toBe(true);
    expect(legs[0].durationMin).toBe(0);
    // Unknown legs should NOT count toward totalTravelMin
    expect(stats.totalTravelMin).toBe(0);
  });

  it("uses OSRM for routable override", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 2000,
          duration: 300,
          geometry: { coordinates: [[0, 0], [1, 1]] },
        }],
      }),
    } as Response);

    const stops: RouteStop[] = [
      { id: "a", lat: 0, lng: 0, durationMin: 30 },
      { id: "b", lat: 1, lng: 1, durationMin: 30 },
    ];

    const overrides = new Map<string, LegOverride>([
      ["a", { visualMode: "bus", osrmMode: "car" }],
    ]);

    const { legs } = await calculateDayRoute(stops, "car", overrides);

    expect(legs[0].mode).toBe("bus"); // visual mode from override
    expect(legs[0].distanceKm).toBe(2); // from OSRM
  });
});
