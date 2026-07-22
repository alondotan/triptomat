import { describe, it, expect } from "vitest";
import { buildTripPlan } from "./buildTripPlan";
import type { PointOfInterest } from "@/types/trip";

function makePOI(overrides: Partial<PointOfInterest> & { id: string; name: string }): PointOfInterest {
  return {
    tripId: "trip1",
    category: "attraction",
    status: "suggested",
    location: {},
    sourceRefs: { email_ids: [], recommendation_ids: [] },
    details: {},
    isCancelled: false,
    isPaid: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as PointOfInterest;
}

const tripPlaces = [{ id: "tp1", tripLocationId: "loc1" }];
const tripLocations = [{ id: "loc1", name: "Paris" }];

describe("buildTripPlan — empty inputs", () => {
  it("returns empty locations for no days", () => {
    const result = buildTripPlan([], [], [], []);
    expect(result.locations).toEqual([]);
    expect(result.unassigned).toBeUndefined();
    expect(result.hotels).toBeUndefined();
  });
});

describe("buildTripPlan — scheduled vs potential split", () => {
  it("puts scheduled POI in day places, not in potential", () => {
    const poi = makePOI({ id: "poi1", name: "Eiffel Tower", location: { city: "Paris" } });
    const day = {
      tripPlaceId: "tp1",
      date: "2025-06-01",
      dayNumber: 1,
      activities: [{ type: "poi", id: "poi1", order: 0 }],
    };
    const result = buildTripPlan([poi], [day], tripPlaces, tripLocations);
    const paris = result.locations.find(l => l.name === "Paris")!;
    expect(paris.days[0].places).toHaveLength(1);
    expect(paris.days[0].places[0].name).toBe("Eiffel Tower");
    expect(paris.potential).toHaveLength(0);
  });

  it("puts unscheduled POI with matching city into potential", () => {
    const poi = makePOI({ id: "poi1", name: "Louvre", location: { city: "Paris" } });
    const day = {
      tripPlaceId: "tp1",
      date: "2025-06-01",
      dayNumber: 1,
      activities: [],
    };
    const result = buildTripPlan([poi], [day], tripPlaces, tripLocations);
    const paris = result.locations.find(l => l.name === "Paris")!;
    expect(paris.potential).toHaveLength(1);
    expect(paris.potential[0].name).toBe("Louvre");
    expect(paris.days[0].places).toHaveLength(0);
  });
});

describe("buildTripPlan — unassigned POIs (no city)", () => {
  it("adds POI with no city to unassigned", () => {
    const poi = makePOI({ id: "poi1", name: "Mystery Place", location: {} });
    const result = buildTripPlan([poi], [], [], []);
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned![0].name).toBe("Mystery Place");
  });

  it("does not include scheduled POI in unassigned even if no city", () => {
    const poi = makePOI({ id: "poi1", name: "Mystery Place", location: {} });
    const day = {
      tripPlaceId: null,
      date: "2025-06-01",
      dayNumber: 1,
      activities: [{ type: "poi", id: "poi1", order: 0 }],
    };
    const result = buildTripPlan([poi], [day], [], []);
    expect(result.unassigned).toBeUndefined();
  });
});

describe("buildTripPlan — hotels", () => {
  it("includes accommodation POIs in hotels list", () => {
    const hotel = makePOI({ id: "h1", name: "Grand Hotel", category: "accommodation", location: { city: "Paris" } });
    const result = buildTripPlan([hotel], [], tripPlaces, tripLocations);
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels![0].name).toBe("Grand Hotel");
    expect(result.hotels![0].city).toBe("Paris");
  });

  it("hotels list is undefined when no accommodations exist", () => {
    const poi = makePOI({ id: "poi1", name: "Eiffel Tower", category: "attraction" });
    const result = buildTripPlan([poi], [], [], []);
    expect(result.hotels).toBeUndefined();
  });

  it("reflects selected hotel from accommodationOptions in day", () => {
    const hotel = makePOI({ id: "h1", name: "Paris Inn", category: "accommodation", location: { city: "Paris" } });
    const day = {
      tripPlaceId: "tp1",
      date: "2025-06-01",
      dayNumber: 1,
      activities: [],
      accommodationOptions: [{ is_selected: true, poi_id: "h1" }],
    };
    const result = buildTripPlan([hotel], [day], tripPlaces, tripLocations);
    const paris = result.locations.find(l => l.name === "Paris")!;
    expect(paris.days[0].hotel_id).toBe("h1");
  });
});

describe("buildTripPlan — activity ordering", () => {
  it("sorts places by activity order", () => {
    const p1 = makePOI({ id: "a1", name: "First", location: { city: "Paris" } });
    const p2 = makePOI({ id: "a2", name: "Second", location: { city: "Paris" } });
    const day = {
      tripPlaceId: "tp1",
      date: "2025-06-01",
      dayNumber: 1,
      activities: [
        { type: "poi", id: "a2", order: 2 },
        { type: "poi", id: "a1", order: 1 },
      ],
    };
    const result = buildTripPlan([p1, p2], [day], tripPlaces, tripLocations);
    const places = result.locations[0].days[0].places;
    expect(places[0].name).toBe("First");
    expect(places[1].name).toBe("Second");
  });
});

describe("buildTripPlan — cities with only potential POIs create locations", () => {
  it("creates a location entry for a city that only has potential POIs", () => {
    const poi = makePOI({ id: "poi1", name: "Colosseum", location: { city: "Rome" } });
    const result = buildTripPlan([poi], [], [], [{ id: "locRome", name: "Rome" }]);
    const rome = result.locations.find(l => l.name === "Rome");
    expect(rome).toBeDefined();
    expect(rome!.potential).toHaveLength(1);
    expect(rome!.days).toHaveLength(0);
  });
});
