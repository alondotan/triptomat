import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { getCategoryForType, isGeographicType, TYPE_TO_CATEGORY, GEO_TYPES, TIP_TYPES } from "./categories.ts";

// ── getCategoryForType ──────────────────────────────────────────────────────

Deno.test("getCategoryForType — returns 'attraction' for landmark", () => {
  assertEquals(getCategoryForType("landmark"), "attraction");
});

Deno.test("getCategoryForType — returns 'accommodation' for hotel", () => {
  assertEquals(getCategoryForType("hotel"), "accommodation");
});

Deno.test("getCategoryForType — returns 'eatery' for restaurant", () => {
  assertEquals(getCategoryForType("restaurant"), "eatery");
});

Deno.test("getCategoryForType — returns 'transportation' for train", () => {
  assertEquals(getCategoryForType("train"), "transportation");
});

Deno.test("getCategoryForType — returns 'service' for atm", () => {
  assertEquals(getCategoryForType("atm"), "service");
});

Deno.test("getCategoryForType — returns 'contact' for tour_guide_contact", () => {
  assertEquals(getCategoryForType("tour_guide_contact"), "contact");
});

Deno.test("getCategoryForType — returns undefined for unknown type", () => {
  assertEquals(getCategoryForType("nonexistent_type"), undefined);
});

// ── isGeographicType ────────────────────────────────────────────────────────

Deno.test("isGeographicType — returns true for 'city'", () => {
  assertEquals(isGeographicType("city"), true);
});

Deno.test("isGeographicType — returns true for 'country'", () => {
  assertEquals(isGeographicType("country"), true);
});

Deno.test("isGeographicType — returns true for 'region'", () => {
  assertEquals(isGeographicType("region"), true);
});

Deno.test("isGeographicType — returns false for 'hotel'", () => {
  assertEquals(isGeographicType("hotel"), false);
});

Deno.test("isGeographicType — returns false for 'restaurant'", () => {
  assertEquals(isGeographicType("restaurant"), false);
});

Deno.test("isGeographicType — returns false for unknown type", () => {
  assertEquals(isGeographicType("foobar"), false);
});

// ── TYPE_TO_CATEGORY completeness ───────────────────────────────────────────

Deno.test("TYPE_TO_CATEGORY — all values are valid categories", () => {
  const validCategories = new Set(["attraction", "accommodation", "eatery", "transportation", "service", "contact", "event"]);
  for (const [type, category] of Object.entries(TYPE_TO_CATEGORY)) {
    assertEquals(validCategories.has(category), true, `Invalid category '${category}' for type '${type}'`);
  }
});

Deno.test("TYPE_TO_CATEGORY — contains expected attraction types", () => {
  const expected = ["museum", "beach", "park", "landmark", "hiking_trail"];
  for (const type of expected) {
    assertEquals(TYPE_TO_CATEGORY[type], "attraction", `Expected '${type}' to be 'attraction'`);
  }
});

Deno.test("TYPE_TO_CATEGORY — contains expected accommodation types", () => {
  const expected = ["hotel", "hostel", "resort", "villa", "guesthouse"];
  for (const type of expected) {
    assertEquals(TYPE_TO_CATEGORY[type], "accommodation", `Expected '${type}' to be 'accommodation'`);
  }
});

// ── GEO_TYPES ───────────────────────────────────────────────────────────────

Deno.test("GEO_TYPES — contains fundamental geo types", () => {
  const expected = ["continent", "country", "city", "town", "village", "region", "district"];
  for (const type of expected) {
    assertEquals(GEO_TYPES.has(type), true, `Expected GEO_TYPES to contain '${type}'`);
  }
});

Deno.test("GEO_TYPES — does not contain non-geo types", () => {
  const nonGeo = ["restaurant", "cafe", "museum"];
  for (const type of nonGeo) {
    assertEquals(GEO_TYPES.has(type), false, `Expected GEO_TYPES to NOT contain '${type}'`);
  }
});

// ── TIP_TYPES ───────────────────────────────────────────────────────────────

Deno.test("TIP_TYPES — contains expected tip types", () => {
  const expected = ["safety_tip", "budget_tip", "packing_tip", "weather_tip"];
  for (const type of expected) {
    assertEquals(TIP_TYPES.has(type), true, `Expected TIP_TYPES to contain '${type}'`);
  }
});

Deno.test("TIP_TYPES — does not contain non-tip types", () => {
  assertEquals(TIP_TYPES.has("hotel"), false);
  assertEquals(TIP_TYPES.has("restaurant"), false);
  assertEquals(TIP_TYPES.has("city"), false);
});
