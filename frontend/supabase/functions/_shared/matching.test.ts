import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { fuzzyMatch } from "./matching.ts";

Deno.test("fuzzyMatch — exact match case-insensitive", () => {
  assertEquals(fuzzyMatch("Hilton", "hilton"), true);
});

Deno.test("fuzzyMatch — a contains b", () => {
  assertEquals(fuzzyMatch("Hilton Garden Inn", "Hilton"), true);
});

Deno.test("fuzzyMatch — b contains a", () => {
  assertEquals(fuzzyMatch("Hilton", "Hilton Garden Inn"), true);
});

Deno.test("fuzzyMatch — trims whitespace", () => {
  assertEquals(fuzzyMatch("  Hilton  ", "hilton"), true);
});

Deno.test("fuzzyMatch — no match returns false", () => {
  assertEquals(fuzzyMatch("Hilton", "Marriott"), false);
});

Deno.test("fuzzyMatch — empty string returns false", () => {
  assertEquals(fuzzyMatch("", "Hilton"), false);
  assertEquals(fuzzyMatch("Hilton", ""), false);
});

Deno.test("fuzzyMatch — whitespace-only returns false", () => {
  assertEquals(fuzzyMatch("   ", "Hilton"), false);
  assertEquals(fuzzyMatch("Hilton", "   "), false);
});

Deno.test("fuzzyMatch — both empty returns false", () => {
  assertEquals(fuzzyMatch("", ""), false);
});
