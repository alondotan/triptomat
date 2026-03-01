import { describe, it, expect } from "vitest";
import {
  hasValue,
  mergeWithNewWins,
  fuzzyMatch,
  mergeSourceRefs,
  STATUS_PRIORITY,
  TRANSPORT_STATUS_PRIORITY,
} from "./helpers";

describe("hasValue", () => {
  it("returns true for non-empty string", () => {
    expect(hasValue("hello")).toBe(true);
  });

  it("returns true for number including 0", () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(42)).toBe(true);
  });

  it("returns true for boolean false", () => {
    expect(hasValue(false)).toBe(true);
  });

  it("returns true for objects and arrays", () => {
    expect(hasValue({})).toBe(true);
    expect(hasValue([])).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasValue(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasValue(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasValue("")).toBe(false);
  });
});

describe("mergeWithNewWins", () => {
  it("incoming primitive overwrites old", () => {
    expect(mergeWithNewWins("old", "new")).toBe("new");
    expect(mergeWithNewWins(1, 2)).toBe(2);
  });

  it("null incoming preserves old", () => {
    expect(mergeWithNewWins("old", null)).toBe("old");
  });

  it("undefined incoming preserves old", () => {
    expect(mergeWithNewWins("old", undefined)).toBe("old");
  });

  it("empty string incoming preserves old", () => {
    expect(mergeWithNewWins("old", "")).toBe("old");
  });

  it("deep merges nested objects", () => {
    const old = { a: { x: 1, y: 2 }, b: "keep" };
    const incoming = { a: { y: 99 } };
    const result = mergeWithNewWins(old, incoming) as Record<string, unknown>;
    expect(result).toEqual({ a: { x: 1, y: 99 }, b: "keep" });
  });

  it("replaces arrays entirely", () => {
    const old = { tags: ["a", "b"] };
    const incoming = { tags: ["c"] };
    const result = mergeWithNewWins(old, incoming) as Record<string, unknown>;
    expect(result).toEqual({ tags: ["c"] });
  });

  it("incoming object replaces null old", () => {
    expect(mergeWithNewWins(null, { a: 1 })).toEqual({ a: 1 });
  });

  it("incoming object replaces non-object old", () => {
    expect(mergeWithNewWins("string", { a: 1 })).toEqual({ a: 1 });
  });

  it("incoming object replaces array old", () => {
    expect(mergeWithNewWins([1, 2], { a: 1 })).toEqual({ a: 1 });
  });

  it("handles empty object incoming — preserves old keys", () => {
    const old = { a: 1, b: 2 };
    const result = mergeWithNewWins(old, {});
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("preserves old keys not in incoming", () => {
    const old = { a: 1, b: 2, c: 3 };
    const incoming = { b: 99 };
    expect(mergeWithNewWins(old, incoming)).toEqual({ a: 1, b: 99, c: 3 });
  });
});

describe("fuzzyMatch", () => {
  it("exact match case-insensitive", () => {
    expect(fuzzyMatch("Hilton", "hilton")).toBe(true);
  });

  it("substring: a contains b", () => {
    expect(fuzzyMatch("Hilton Garden Inn", "Hilton")).toBe(true);
  });

  it("substring: b contains a", () => {
    expect(fuzzyMatch("Hilton", "Hilton Garden Inn")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(fuzzyMatch("  Hilton  ", "hilton")).toBe(true);
  });

  it("returns false for no match", () => {
    expect(fuzzyMatch("Hilton", "Marriott")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(fuzzyMatch("", "Hilton")).toBe(false);
    expect(fuzzyMatch("Hilton", "")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(fuzzyMatch(null as unknown as string, "a")).toBe(false);
    expect(fuzzyMatch("a", undefined as unknown as string)).toBe(false);
  });
});

describe("mergeSourceRefs", () => {
  it("merges unique IDs from both sides", () => {
    const result = mergeSourceRefs(
      { email_ids: ["e1"], recommendation_ids: ["r1"] },
      { email_ids: ["e2"], recommendation_ids: ["r2"] },
    );
    expect(result.email_ids).toEqual(expect.arrayContaining(["e1", "e2"]));
    expect(result.recommendation_ids).toEqual(expect.arrayContaining(["r1", "r2"]));
  });

  it("deduplicates overlapping IDs", () => {
    const result = mergeSourceRefs(
      { email_ids: ["e1", "e2"], recommendation_ids: ["r1"] },
      { email_ids: ["e2", "e3"], recommendation_ids: ["r1"] },
    );
    expect(result.email_ids).toHaveLength(3);
    expect(result.recommendation_ids).toHaveLength(1);
  });

  it("handles undefined arrays", () => {
    const result = mergeSourceRefs(
      { email_ids: undefined as unknown as string[], recommendation_ids: ["r1"] },
      { email_ids: ["e1"], recommendation_ids: undefined as unknown as string[] },
    );
    expect(result.email_ids).toEqual(["e1"]);
    expect(result.recommendation_ids).toEqual(["r1"]);
  });

  it("handles empty arrays", () => {
    const result = mergeSourceRefs(
      { email_ids: [], recommendation_ids: [] },
      { email_ids: [], recommendation_ids: [] },
    );
    expect(result.email_ids).toEqual([]);
    expect(result.recommendation_ids).toEqual([]);
  });
});

describe("STATUS_PRIORITY", () => {
  it("contains all expected statuses", () => {
    expect(Object.keys(STATUS_PRIORITY)).toEqual(
      expect.arrayContaining(["booked", "visited", "in_plan", "matched", "candidate"]),
    );
  });

  it("has correct ordering", () => {
    expect(STATUS_PRIORITY.booked).toBeGreaterThan(STATUS_PRIORITY.visited);
    expect(STATUS_PRIORITY.visited).toBeGreaterThan(STATUS_PRIORITY.in_plan);
    expect(STATUS_PRIORITY.in_plan).toBeGreaterThan(STATUS_PRIORITY.matched);
    expect(STATUS_PRIORITY.matched).toBeGreaterThan(STATUS_PRIORITY.candidate);
  });
});

describe("TRANSPORT_STATUS_PRIORITY", () => {
  it("contains all expected statuses", () => {
    expect(Object.keys(TRANSPORT_STATUS_PRIORITY)).toEqual(
      expect.arrayContaining(["completed", "booked", "in_plan", "candidate"]),
    );
  });

  it("has correct ordering", () => {
    expect(TRANSPORT_STATUS_PRIORITY.completed).toBeGreaterThan(TRANSPORT_STATUS_PRIORITY.booked);
    expect(TRANSPORT_STATUS_PRIORITY.booked).toBeGreaterThan(TRANSPORT_STATUS_PRIORITY.in_plan);
    expect(TRANSPORT_STATUS_PRIORITY.in_plan).toBeGreaterThan(TRANSPORT_STATUS_PRIORITY.candidate);
  });
});
