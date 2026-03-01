import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { hasValue, mergeWithNewWins } from "./merge.ts";

// ── hasValue ─────────────────────────────────────────────

Deno.test("hasValue — true for non-empty string", () => {
  assertEquals(hasValue("hello"), true);
});

Deno.test("hasValue — true for number 0", () => {
  assertEquals(hasValue(0), true);
});

Deno.test("hasValue — true for boolean false", () => {
  assertEquals(hasValue(false), true);
});

Deno.test("hasValue — true for objects and arrays", () => {
  assertEquals(hasValue({}), true);
  assertEquals(hasValue([]), true);
});

Deno.test("hasValue — false for null", () => {
  assertEquals(hasValue(null), false);
});

Deno.test("hasValue — false for undefined", () => {
  assertEquals(hasValue(undefined), false);
});

Deno.test("hasValue — false for empty string", () => {
  assertEquals(hasValue(""), false);
});

// ── mergeWithNewWins ─────────────────────────────────────

Deno.test("mergeWithNewWins — incoming primitive overwrites old", () => {
  assertEquals(mergeWithNewWins("old", "new"), "new");
  assertEquals(mergeWithNewWins(1, 2), 2);
});

Deno.test("mergeWithNewWins — null incoming preserves old", () => {
  assertEquals(mergeWithNewWins("old", null), "old");
});

Deno.test("mergeWithNewWins — undefined incoming preserves old", () => {
  assertEquals(mergeWithNewWins("old", undefined), "old");
});

Deno.test("mergeWithNewWins — empty string incoming preserves old", () => {
  assertEquals(mergeWithNewWins("old", ""), "old");
});

Deno.test("mergeWithNewWins — deep merges nested objects", () => {
  const old = { a: { x: 1, y: 2 }, b: "keep" };
  const incoming = { a: { y: 99 } };
  assertEquals(mergeWithNewWins(old, incoming), { a: { x: 1, y: 99 }, b: "keep" });
});

Deno.test("mergeWithNewWins — replaces arrays entirely", () => {
  const old = { tags: ["a", "b"] };
  const incoming = { tags: ["c"] };
  assertEquals(mergeWithNewWins(old, incoming), { tags: ["c"] });
});

Deno.test("mergeWithNewWins — incoming object replaces null old", () => {
  assertEquals(mergeWithNewWins(null, { a: 1 }), { a: 1 });
});

Deno.test("mergeWithNewWins — incoming object replaces array old", () => {
  assertEquals(mergeWithNewWins([1, 2], { a: 1 }), { a: 1 });
});

Deno.test("mergeWithNewWins — empty incoming preserves old keys", () => {
  assertEquals(mergeWithNewWins({ a: 1, b: 2 }, {}), { a: 1, b: 2 });
});

Deno.test("mergeWithNewWins — preserves old keys not in incoming", () => {
  assertEquals(
    mergeWithNewWins({ a: 1, b: 2, c: 3 }, { b: 99 }),
    { a: 1, b: 99, c: 3 },
  );
});
