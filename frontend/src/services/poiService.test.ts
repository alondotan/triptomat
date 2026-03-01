import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PointOfInterest, POILocation, SourceRefs, POIDetails, POIBooking } from "@/types/trip";

// ── Mock Supabase before importing the module under test ─

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockContains = vi.fn();

function buildChain() {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue(chain);
  chain.contains = vi.fn().mockReturnValue(chain);
  // Default: resolve with empty data
  chain.then = undefined;
  // Allow awaiting — make the chain itself act like a resolved promise
  const asPromise = (data: any = null, error: any = null) => {
    const p = Promise.resolve({ data, error });
    chain.select = vi.fn().mockReturnValue({ ...chain, ...p, then: p.then.bind(p), catch: p.catch.bind(p) });
    return chain;
  };
  chain._resolve = asPromise;
  return chain;
}

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

import { mapPOI, createOrMergePOI, mergeTwoPOIs } from "./poiService";

// ── mapPOI (pure function) ───────────────────────────────

describe("mapPOI", () => {
  it("maps snake_case row to camelCase PointOfInterest", () => {
    const row = {
      id: "poi-1",
      trip_id: "trip-1",
      category: "attraction",
      sub_category: "museum",
      name: "Anne Frank House",
      status: "booked",
      location: { city: "Amsterdam", country: "Netherlands" },
      source_refs: { email_ids: ["e1"], recommendation_ids: [] },
      details: { cost: { amount: 16, currency: "EUR" } },
      is_cancelled: false,
      is_paid: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };

    const result = mapPOI(row);
    expect(result.id).toBe("poi-1");
    expect(result.tripId).toBe("trip-1");
    expect(result.category).toBe("attraction");
    expect(result.subCategory).toBe("museum");
    expect(result.name).toBe("Anne Frank House");
    expect(result.status).toBe("booked");
    expect(result.location.city).toBe("Amsterdam");
    expect(result.sourceRefs.email_ids).toEqual(["e1"]);
    expect(result.isCancelled).toBe(false);
    expect(result.isPaid).toBe(true);
  });

  it("provides defaults for missing fields", () => {
    const row = {
      id: "poi-2",
      trip_id: "trip-1",
      category: "eatery",
      name: "Cafe",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const result = mapPOI(row);
    expect(result.subCategory).toBeUndefined();
    expect(result.status).toBe("candidate");
    expect(result.location).toEqual({});
    expect(result.sourceRefs).toEqual({ email_ids: [], recommendation_ids: [] });
    expect(result.isCancelled).toBe(false);
    expect(result.isPaid).toBe(false);
  });

  it("normalizes legacy booking to bookings array", () => {
    const row = {
      id: "poi-3",
      trip_id: "trip-1",
      category: "attraction",
      name: "Tour",
      details: {
        booking: { reservation_date: "2026-04-01", reservation_hour: "10:00" },
      },
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const result = mapPOI(row);
    expect(result.details.bookings).toEqual([
      { reservation_date: "2026-04-01", reservation_hour: "10:00" },
    ]);
    expect((result.details as any).booking).toBeUndefined();
  });

  it("preserves existing bookings array (no legacy conversion)", () => {
    const bookings = [
      { reservation_date: "2026-04-01", reservation_hour: "10:00" },
      { reservation_date: "2026-04-02", reservation_hour: "14:00" },
    ];
    const row = {
      id: "poi-4",
      trip_id: "trip-1",
      category: "eatery",
      name: "Restaurant",
      details: { bookings },
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const result = mapPOI(row);
    expect(result.details.bookings).toEqual(bookings);
  });
});

// ── createOrMergePOI ─────────────────────────────────────

describe("createOrMergePOI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const basePoi = {
    tripId: "trip-1",
    category: "attraction" as const,
    name: "Anne Frank House",
    status: "candidate" as const,
    location: { city: "Amsterdam", country: "Netherlands" } as POILocation,
    sourceRefs: { email_ids: [], recommendation_ids: [] } as SourceRefs,
    details: {} as POIDetails,
    subCategory: "museum",
    isCancelled: false,
    isPaid: false,
  };

  it("creates new POI when no match found", async () => {
    // Mock: select returns empty candidates
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    // Mock: insert returns new POI
    const insertResult = {
      data: { id: "new-poi", trip_id: "trip-1", category: "attraction", name: "Anne Frank House", status: "candidate", location: { city: "Amsterdam" }, source_refs: { email_ids: [], recommendation_ids: [] }, details: {}, is_cancelled: false, is_paid: false, created_at: "2026-01-01", updated_at: "2026-01-01" },
      error: null,
    };
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(insertResult),
      }),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "points_of_interest") {
        return {
          select: vi.fn().mockReturnValue(selectChain),
          insert: vi.fn().mockReturnValue(insertChain),
        };
      }
    });

    const result = await createOrMergePOI(basePoi);
    expect(result.merged).toBe(false);
    expect(result.poi.id).toBe("new-poi");
  });

  it("merges when name and category match", async () => {
    const existingRow = {
      id: "existing-poi",
      trip_id: "trip-1",
      category: "attraction",
      name: "Anne Frank House",
      status: "booked",
      location: { city: "Amsterdam", country: "Netherlands", address: "Prinsengracht 263" },
      source_refs: { email_ids: ["e1"], recommendation_ids: [] },
      details: { cost: { amount: 16, currency: "EUR" } },
      sub_category: "museum",
      is_cancelled: false,
      is_paid: true,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    // select → returns existing candidate
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [existingRow], error: null }),
      }),
    };
    // update → success
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    }));

    const result = await createOrMergePOI(basePoi);
    expect(result.merged).toBe(true);
    expect(result.poi.id).toBe("existing-poi");
  });

  it("does not downgrade status on merge", async () => {
    const existingRow = {
      id: "poi-booked",
      trip_id: "trip-1",
      category: "attraction",
      name: "Anne Frank House",
      status: "booked",  // higher priority
      location: {},
      source_refs: { email_ids: [], recommendation_ids: [] },
      details: {},
      is_cancelled: false,
      is_paid: false,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const selectChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [existingRow], error: null }),
      }),
    };
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    }));

    // New POI has status "candidate" (lower priority)
    const result = await createOrMergePOI({ ...basePoi, status: "candidate" });
    expect(result.merged).toBe(true);
    // Status should remain "booked" (not downgraded)
    expect(result.poi.status).toBe("booked");
  });
});

// ── mergeTwoPOIs ─────────────────────────────────────────

describe("mergeTwoPOIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makePOI = (overrides: Partial<PointOfInterest> = {}): PointOfInterest => ({
    id: "poi-1",
    tripId: "trip-1",
    category: "attraction",
    name: "Place A",
    status: "candidate",
    location: {} as POILocation,
    sourceRefs: { email_ids: [], recommendation_ids: [] },
    details: {} as POIDetails,
    isCancelled: false,
    isPaid: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  });

  function setupMergeChains() {
    const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
    const deleteChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    }));
  }

  it("primary values win over secondary", async () => {
    setupMergeChains();

    const primary = makePOI({
      id: "p1",
      location: { city: "Amsterdam" } as POILocation,
    });
    const secondary = makePOI({
      id: "p2",
      location: { city: "Rotterdam", country: "Netherlands" } as POILocation,
    });

    const result = await mergeTwoPOIs(primary, secondary);
    // Primary's city wins, secondary's country fills gap
    expect(result.location.city).toBe("Amsterdam");
    expect(result.location.country).toBe("Netherlands");
  });

  it("deduplicates bookings from both POIs", async () => {
    setupMergeChains();

    const primary = makePOI({
      id: "p1",
      details: {
        bookings: [{ reservation_date: "2026-04-01", reservation_hour: "10:00" }],
      } as POIDetails,
    });
    const secondary = makePOI({
      id: "p2",
      details: {
        bookings: [
          { reservation_date: "2026-04-01", reservation_hour: "10:00" }, // duplicate
          { reservation_date: "2026-04-02", reservation_hour: "14:00" }, // unique
        ],
      } as POIDetails,
    });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.details.bookings).toHaveLength(2);
  });

  it("merges sourceRefs from both", async () => {
    setupMergeChains();

    const primary = makePOI({
      id: "p1",
      sourceRefs: { email_ids: ["e1"], recommendation_ids: ["r1"] },
    });
    const secondary = makePOI({
      id: "p2",
      sourceRefs: { email_ids: ["e2"], recommendation_ids: ["r2"] },
    });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.sourceRefs.email_ids).toEqual(expect.arrayContaining(["e1", "e2"]));
    expect(result.sourceRefs.recommendation_ids).toEqual(expect.arrayContaining(["r1", "r2"]));
  });

  it("upgrades status from secondary if higher", async () => {
    setupMergeChains();

    const primary = makePOI({ id: "p1", status: "candidate" });
    const secondary = makePOI({ id: "p2", status: "booked" });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.status).toBe("booked");
  });

  it("does not downgrade status", async () => {
    setupMergeChains();

    const primary = makePOI({ id: "p1", status: "booked" });
    const secondary = makePOI({ id: "p2", status: "candidate" });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.status).toBe("booked");
  });

  it("isPaid is additive", async () => {
    setupMergeChains();

    const primary = makePOI({ id: "p1", isPaid: false });
    const secondary = makePOI({ id: "p2", isPaid: true });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.isPaid).toBe(true);
  });

  it("un-cancels if primary cancelled but secondary is not", async () => {
    setupMergeChains();

    const primary = makePOI({ id: "p1", isCancelled: true });
    const secondary = makePOI({ id: "p2", isCancelled: false });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.isCancelled).toBe(false);
  });

  it("fills subCategory from secondary if primary has none", async () => {
    setupMergeChains();

    const primary = makePOI({ id: "p1", subCategory: undefined });
    const secondary = makePOI({ id: "p2", subCategory: "museum" });

    const result = await mergeTwoPOIs(primary, secondary);
    expect(result.subCategory).toBe("museum");
  });
});
