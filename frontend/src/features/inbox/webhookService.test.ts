import { describe, it, expect } from "vitest";
import { deepMerge, daysBetween, addEmailToSourceRefs } from "./webhookService";

// ── deepMerge ──────────────────────────────────────────────────

describe("deepMerge", () => {
  it("returns old when incoming is null", () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("returns old when incoming is undefined", () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it("replaces old with incoming primitive", () => {
    expect(deepMerge("old", "new")).toBe("new");
  });

  it("replaces old with incoming array (no array merge)", () => {
    expect(deepMerge([1, 2], [3, 4])).toEqual([3, 4]);
  });

  it("replaces old object with incoming array", () => {
    expect(deepMerge({ a: 1 }, [1, 2])).toEqual([1, 2]);
  });

  it("replaces old array with incoming object", () => {
    expect(deepMerge([1, 2], { a: 1 })).toEqual({ a: 1 });
  });

  it("merges flat objects — incoming wins", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("merges nested objects recursively", () => {
    const old = { a: { x: 1, y: 2 }, b: 10 };
    const incoming = { a: { y: 3, z: 4 } };
    expect(deepMerge(old, incoming)).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 10 });
  });

  it("preserves old keys not present in incoming", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 99 })).toEqual({ a: 1, b: 99 });
  });

  it("skips incoming keys that are undefined", () => {
    expect(deepMerge({ a: 1 }, { a: undefined, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("does not skip incoming null nested values (null replaces)", () => {
    // incoming null at nested level → old value wins because of first guard
    expect(deepMerge({ a: { x: 1 } }, { a: null })).toEqual({ a: { x: 1 } });
  });

  it("replaces old null with incoming object", () => {
    expect(deepMerge({ a: null }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });

  it("handles deeply nested merge (3 levels)", () => {
    const old = { a: { b: { c: 1, d: 2 } } };
    const incoming = { a: { b: { c: 99 } } };
    expect(deepMerge(old, incoming)).toEqual({ a: { b: { c: 99, d: 2 } } });
  });
});

// ── daysBetween ────────────────────────────────────────────────

describe("daysBetween", () => {
  it("returns 1 for same day", () => {
    expect(daysBetween("2026-03-15", "2026-03-15")).toBe(1);
  });

  it("returns 1 for one night stay", () => {
    expect(daysBetween("2026-03-15", "2026-03-16")).toBe(1);
  });

  it("returns correct nights for multi-day", () => {
    expect(daysBetween("2026-03-15", "2026-03-20")).toBe(5);
  });

  it("handles month boundary", () => {
    expect(daysBetween("2026-03-30", "2026-04-02")).toBe(3);
  });

  it("handles year boundary", () => {
    expect(daysBetween("2025-12-30", "2026-01-02")).toBe(3);
  });
});

// ── addEmailToSourceRefs ───────────────────────────────────────

describe("addEmailToSourceRefs", () => {
  it("creates refs from null", () => {
    const result = addEmailToSourceRefs(null, "email-1");
    expect(result.email_ids).toContain("email-1");
  });

  it("creates refs from undefined", () => {
    const result = addEmailToSourceRefs(undefined, "email-1");
    expect(result.email_ids).toContain("email-1");
  });

  it("adds email to existing refs", () => {
    const existing = { email_ids: ["email-1"], recommendation_ids: [] };
    const result = addEmailToSourceRefs(existing, "email-2");
    expect(result.email_ids).toEqual(["email-1", "email-2"]);
  });

  it("deduplicates — does not add same email twice", () => {
    const existing = { email_ids: ["email-1"], recommendation_ids: [] };
    const result = addEmailToSourceRefs(existing, "email-1");
    expect(result.email_ids).toEqual(["email-1"]);
  });

  it("preserves other keys in refs", () => {
    const existing = { email_ids: [], recommendation_ids: ["rec-1"], custom: true };
    const result = addEmailToSourceRefs(existing, "email-1");
    expect(result.recommendation_ids).toEqual(["rec-1"]);
    expect(result.custom).toBe(true);
  });
});
