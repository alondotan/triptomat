import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before importing the module under test
function buildChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.then = undefined;
  Object.defineProperty(chain, Symbol.toStringTag, { value: "MockChain" });
  // Make the chain thenable so await works
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return chain;
}

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

const mockUpdatePOI = vi.fn().mockResolvedValue(undefined);
vi.mock("@/features/poi/poiService", () => ({
  updatePOI: (...args: unknown[]) => mockUpdatePOI(...args),
}));

import { applyAIToolCalls } from "./applyAIToolCalls";
import type { PointOfInterest } from "@/types/trip";
import type { DraftDay } from "@/types/itineraryDraft";

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

const baseTripContext = {
  tripId: "trip1",
  currency: "USD",
  numberOfDays: 5,
  startDate: "2025-06-01",
  endDate: "2025-06-05",
};

const baseParams = {
  tripContext: baseTripContext,
  pois: [] as PointOfInterest[],
  itineraryDays: [],
  activeTrip: {},
  instantApply: false,
  applyToolCall: vi.fn().mockReturnValue([{ id: "day1" }] as unknown as DraftDay[]),
  applyDayUpdate: vi.fn().mockReturnValue([{ id: "day1" }] as unknown as DraftDay[]),
  addPOI: vi.fn().mockResolvedValue(undefined),
  updateCurrentTrip: vi.fn().mockResolvedValue(undefined),
  history: { pushHistory: vi.fn() },
  onItineraryUpdate: undefined,
  onSuggestPlaces: undefined,
  snapshotRef: { current: new Map<number, DraftDay[]>() },
  updatedMessagesLength: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(buildChain());
});

describe("applyAIToolCalls — set_itinerary", () => {
  it("calls applyToolCall and stores snapshot", async () => {
    const params = { ...baseParams, snapshotRef: { current: new Map() } };
    const result = await applyAIToolCalls({
      ...params,
      toolCalls: [{ name: "set_itinerary", args: { days: [] } }],
    });
    expect(params.applyToolCall).toHaveBeenCalledWith([]);
    expect(result.newDays).toBeDefined();
    expect(params.snapshotRef.current.has(3)).toBe(true);
  });

  it("calls onItineraryUpdate with specific places", async () => {
    const onItineraryUpdate = vi.fn();
    const days = [
      {
        day_number: 1,
        location_name: "Paris",
        places: [
          { place_name: "Eiffel Tower", is_specific_place: true, place_id: "123" },
          { place_name: "Generic", is_specific_place: false },
        ],
      },
    ];
    await applyAIToolCalls({
      ...baseParams,
      onItineraryUpdate,
      toolCalls: [{ name: "set_itinerary", args: { days } }],
    });
    expect(onItineraryUpdate).toHaveBeenCalledOnce();
    const [places] = onItineraryUpdate.mock.calls[0];
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe("Eiffel Tower");
    expect(places[0].location).toBe("Paris");
  });

  it("pushes history when instantApply is true", async () => {
    const pushHistory = vi.fn();
    await applyAIToolCalls({
      ...baseParams,
      instantApply: true,
      history: { pushHistory },
      toolCalls: [{ name: "set_itinerary", args: { days: [] } }],
    });
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it("does not push history when instantApply is false", async () => {
    const pushHistory = vi.fn();
    await applyAIToolCalls({
      ...baseParams,
      instantApply: false,
      history: { pushHistory },
      toolCalls: [{ name: "set_itinerary", args: { days: [] } }],
    });
    expect(pushHistory).not.toHaveBeenCalled();
  });
});

describe("applyAIToolCalls — update_day", () => {
  it("calls applyDayUpdate and stores snapshot", async () => {
    const params = { ...baseParams, snapshotRef: { current: new Map() } };
    const result = await applyAIToolCalls({
      ...params,
      toolCalls: [{ name: "update_day", args: { day: { day_number: 2, places: [] } } }],
    });
    expect(params.applyDayUpdate).toHaveBeenCalledWith({ day_number: 2, places: [] });
    expect(result.newDays).toBeDefined();
    expect(params.snapshotRef.current.has(3)).toBe(true);
  });
});

describe("applyAIToolCalls — apply_itinerary", () => {
  it("sets shouldApply to true", async () => {
    const result = await applyAIToolCalls({
      ...baseParams,
      toolCalls: [{ name: "apply_itinerary", args: {} }],
    });
    expect(result.shouldApply).toBe(true);
  });
});

describe("applyAIToolCalls — suggest_places", () => {
  it("calls onSuggestPlaces with the places array", async () => {
    const onSuggestPlaces = vi.fn();
    const places = [{ name: "Louvre", category: "attraction" }];
    await applyAIToolCalls({
      ...baseParams,
      onSuggestPlaces,
      toolCalls: [{ name: "suggest_places", args: { places } }],
    });
    expect(onSuggestPlaces).toHaveBeenCalledWith(places, 3);
  });
});

describe("applyAIToolCalls — add_places", () => {
  it("calls addPOI for each place", async () => {
    const addPOI = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      addPOI,
      toolCalls: [
        {
          name: "add_places",
          args: {
            places: [
              { name: "Place A", category: "attraction" },
              { name: "Place B", category: "eatery" },
            ],
          },
        },
      ],
    });
    expect(addPOI).toHaveBeenCalledTimes(2);
    expect(addPOI.mock.calls[0][0].name).toBe("Place A");
    expect(addPOI.mock.calls[1][0].name).toBe("Place B");
  });

  it("ignores add_places when array is empty", async () => {
    const addPOI = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      addPOI,
      toolCalls: [{ name: "add_places", args: { places: [] } }],
    });
    expect(addPOI).not.toHaveBeenCalled();
  });
});

describe("applyAIToolCalls — add_place", () => {
  it("calls addPOI with mapped category and status=suggested", async () => {
    const addPOI = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      addPOI,
      toolCalls: [{ name: "add_place", args: { name: "Louvre", category: "attraction", city: "Paris" } }],
    });
    expect(addPOI).toHaveBeenCalledOnce();
    const arg = addPOI.mock.calls[0][0];
    expect(arg.name).toBe("Louvre");
    expect(arg.status).toBe("suggested");
    expect(arg.location.city).toBe("Paris");
  });

  it("sets cost and notes from args into details", async () => {
    const addPOI = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      addPOI,
      toolCalls: [
        { name: "add_place", args: { name: "Museum", category: "attraction", cost: 20, notes: "Great!" } },
      ],
    });
    const arg = addPOI.mock.calls[0][0];
    expect(arg.details.cost).toEqual({ amount: 20, currency: "USD" });
    expect(arg.details.notes.user_summary).toBe("Great!");
  });
});

describe("applyAIToolCalls — update_place", () => {
  it("calls updatePOI by place_id when found", async () => {
    const poi = makePOI({ id: "poi1", name: "Louvre" });
    await applyAIToolCalls({
      ...baseParams,
      pois: [poi],
      toolCalls: [{ name: "update_place", args: { place_id: "poi1", status: "booked" } }],
    });
    expect(mockUpdatePOI).toHaveBeenCalledWith("poi1", expect.objectContaining({ status: "booked" }));
  });

  it("calls updatePOI by name (case-insensitive) when no place_id", async () => {
    const poi = makePOI({ id: "poi1", name: "Louvre" });
    await applyAIToolCalls({
      ...baseParams,
      pois: [poi],
      toolCalls: [{ name: "update_place", args: { name: "louvre", cost: 15 } }],
    });
    expect(mockUpdatePOI).toHaveBeenCalledWith(
      "poi1",
      expect.objectContaining({ details: expect.objectContaining({ cost: { amount: 15, currency: "USD" } }) }),
    );
  });

  it("does nothing when POI not found", async () => {
    await applyAIToolCalls({
      ...baseParams,
      pois: [],
      toolCalls: [{ name: "update_place", args: { place_id: "missing", status: "booked" } }],
    });
    expect(mockUpdatePOI).not.toHaveBeenCalled();
  });
});

describe("applyAIToolCalls — add_days", () => {
  it("calls updateCurrentTrip with increased day count", async () => {
    const updateCurrentTrip = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      updateCurrentTrip,
      toolCalls: [{ name: "add_days", args: { count: 3 } }],
    });
    expect(updateCurrentTrip).toHaveBeenCalledWith({ numberOfDays: 8 });
  });

  it("ignores add_days when count is 0", async () => {
    const updateCurrentTrip = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      updateCurrentTrip,
      toolCalls: [{ name: "add_days", args: { count: 0 } }],
    });
    expect(updateCurrentTrip).not.toHaveBeenCalled();
  });
});

describe("applyAIToolCalls — shift_trip_dates", () => {
  it("calls updateCurrentTrip with shifted start and end dates", async () => {
    const updateCurrentTrip = vi.fn().mockResolvedValue(undefined);
    await applyAIToolCalls({
      ...baseParams,
      updateCurrentTrip,
      toolCalls: [{ name: "shift_trip_dates", args: { new_start_date: "2025-06-08" } }],
    });
    // Original: 2025-06-01 → 2025-06-08 (+7 days); end: 2025-06-05 → 2025-06-12
    expect(updateCurrentTrip).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2025-06-08", endDate: "2025-06-12" }),
    );
  });

  it("shifts dates of itinerary days in supabase", async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue(chain);
    const itineraryDays = [{ id: "day1", date: "2025-06-01" }];
    await applyAIToolCalls({
      ...baseParams,
      itineraryDays,
      toolCalls: [{ name: "shift_trip_dates", args: { new_start_date: "2025-06-08" } }],
    });
    expect(mockFrom).toHaveBeenCalledWith("itinerary_days");
    expect(chain.update).toHaveBeenCalledWith({ date: "2025-06-08" });
    expect(chain.eq).toHaveBeenCalledWith("id", "day1");
  });

  it("skips days without a date when shifting", async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue(chain);
    const itineraryDays = [{ id: "day1", date: null }];
    await applyAIToolCalls({
      ...baseParams,
      itineraryDays,
      toolCalls: [{ name: "shift_trip_dates", args: { new_start_date: "2025-06-08" } }],
    });
    expect(chain.update).not.toHaveBeenCalled();
  });
});

describe("applyAIToolCalls — return values", () => {
  it("returns shouldApply=false and newDays=null when no relevant tool calls", async () => {
    const result = await applyAIToolCalls({
      ...baseParams,
      toolCalls: [{ name: "unknown_tool", args: {} }],
    });
    expect(result.shouldApply).toBe(false);
    expect(result.newDays).toBeNull();
  });
});
