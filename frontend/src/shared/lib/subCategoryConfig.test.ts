import { describe, it, expect, beforeAll, vi } from "vitest";
import type { SubCategoryConfig } from "./subCategoryConfig";

// Minimal but realistic config fixture covering all categories and features
const testConfig: SubCategoryConfig = {
  master_list: [
    {
      type: "continent",
      icon: "public",
      category: "Geography",
      is_geo_location: true,
      spatial_type: "area",
      names: { en: "Continent", he: "יבשת" },
    },
    {
      type: "country",
      icon: "flag",
      category: "Geography",
      is_geo_location: true,
      spatial_type: "area",
      names: { en: "Country", he: "מדינה" },
    },
    {
      type: "river",
      icon: "waves",
      category: "Activities",
      is_geo_location: true,
      spatial_type: "area",
      names: { en: "River", he: "נהר" },
      categoryGroup: "nature",
    },
    {
      type: "museum",
      icon: "museum",
      category: "Activities",
      is_geo_location: false,
      names: { en: "Museum", he: "מוזיאון" },
      categoryGroup: "history_culture",
    },
    {
      type: "restaurant",
      icon: "restaurant",
      category: "Eateries",
      is_geo_location: false,
      names: { en: "Restaurant", he: "מסעדה" },
      categoryGroup: "food_drink",
    },
    {
      type: "cafe",
      icon: "local_cafe",
      category: "Eateries",
      is_geo_location: false,
      names: { en: "Café", he: "בית קפה" },
      categoryGroup: "food_drink",
    },
    {
      type: "hotel",
      icon: "hotel",
      category: "Accommodations",
      is_geo_location: false,
      names: { en: "Hotel", he: "מלון" },
    },
    {
      type: "car",
      icon: "directions_car",
      category: "Transportation",
      is_geo_location: false,
      names: { en: "Car", he: "רכב" },
    },
    {
      type: "bus",
      icon: "directions_bus",
      category: "Transportation",
      is_geo_location: false,
      names: { en: "Bus", he: "אוטובוס" },
    },
    {
      type: "best_time_visit",
      icon: "event_available",
      category: "Tips",
      is_geo_location: false,
      names: { en: "Best Time Visit", he: "הזמן הטוב ביותר לביקור" },
    },
    {
      type: "safety_tip",
      icon: "gpp_maybe",
      category: "Tips",
      is_geo_location: false,
      names: { en: "Safety Tip", he: "טיפ בטיחות" },
    },
    {
      type: "sim_card",
      icon: "sim_card",
      category: "Services",
      is_geo_location: false,
      names: { en: "SIM Card", he: "כרטיס SIM" },
    },
    {
      type: "tour_guide",
      icon: "person",
      category: "Contacts",
      is_geo_location: false,
      names: { en: "Tour Guide", he: "מדריך טיולים" },
    },
    {
      type: "festival",
      icon: "festival",
      category: "Events",
      is_geo_location: false,
      names: { en: "Festival", he: "פסטיבל" },
    },
  ],
  categories: {
    Activities: {
      db_name: "attraction",
      icon: "zap",
      color: "text-blue-500",
      labels: [{ he: "אטרקציות" }, { en: "Attractions" }],
    },
    Events: {
      db_name: "attraction",
      icon: "calendar",
      color: "text-purple-500",
      labels: [{ he: "אירועים" }, { en: "Events" }],
    },
    Accommodations: {
      db_name: "accommodation",
      icon: "bed",
      color: "text-indigo-500",
      labels: [{ he: "לינה" }, { en: "Accommodations" }],
    },
    Eateries: {
      db_name: "eatery",
      icon: "utensils",
      color: "text-orange-500",
      labels: [{ he: "אוכל" }, { en: "Eateries" }],
    },
    Transportation: {
      db_name: "transportation",
      icon: "plane",
      color: "text-cyan-500",
      labels: [{ he: "תחבורה" }, { en: "Transportation" }],
    },
    Services: {
      db_name: "service",
      icon: "wrench",
      color: "text-slate-500",
      labels: [{ he: "שירותים" }, { en: "Services" }],
    },
    Contacts: {
      db_name: "contact",
      icon: "users",
      color: "text-teal-500",
      labels: [{ he: "אנשי קשר" }, { en: "Contacts" }],
    },
    Tips: {
      db_name: null,
      icon: "lightbulb",
      color: "text-yellow-500",
      labels: [{ he: "טיפים" }, { en: "Tips" }],
    },
    Geography: {
      db_name: null,
      icon: "map",
      color: "text-emerald-500",
      labels: [{ he: "גיאוגרפיה" }, { en: "Geography" }],
    },
  },
  categoryGroups: {
    nature: { en: "Nature", he: "טבע" },
    history_culture: { en: "History & Culture", he: "היסטוריה ותרבות" },
    food_drink: { en: "Food & Drink", he: "אוכל ושתייה" },
  },
};

// Mock fetch before the module auto-loads config on import
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(testConfig),
  })
);

// Dynamic import so the module's top-level loadSubCategoryConfig() uses our mock
let mod: typeof import("./subCategoryConfig");

beforeAll(async () => {
  mod = await import("./subCategoryConfig");
  // Ensure the config is fully loaded
  await mod.loadSubCategoryConfig();
});

// ─── getSubCategoryEntry ─────────────────────────────────────────────────────

describe("getSubCategoryEntry", () => {
  it("returns the entry for a known type", () => {
    const entry = mod.getSubCategoryEntry("restaurant");
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("restaurant");
    expect(entry!.category).toBe("Eateries");
    expect(entry!.names?.en).toBe("Restaurant");
  });

  it("is case-insensitive", () => {
    const entry = mod.getSubCategoryEntry("RESTAURANT");
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("restaurant");
  });

  it("returns undefined for an unknown type", () => {
    expect(mod.getSubCategoryEntry("nonexistent_type_xyz")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(mod.getSubCategoryEntry("")).toBeUndefined();
  });
});

// ─── getSubCategoryLabel ─────────────────────────────────────────────────────

describe("getSubCategoryLabel", () => {
  it("returns English label when lang is 'en'", () => {
    expect(mod.getSubCategoryLabel("restaurant", "en")).toBe("Restaurant");
  });

  it("returns Hebrew label when lang is 'he'", () => {
    expect(mod.getSubCategoryLabel("restaurant", "he")).toBe("מסעדה");
  });

  it("falls back to English label when lang is not 'he'", () => {
    expect(mod.getSubCategoryLabel("restaurant", "fr")).toBe("Restaurant");
  });

  it("returns empty string for empty type", () => {
    expect(mod.getSubCategoryLabel("")).toBe("");
  });

  it("returns the raw type string for an unknown type", () => {
    expect(mod.getSubCategoryLabel("unknown_thing", "en")).toBe(
      "unknown_thing"
    );
  });
});

// ─── getSubCategoryGroup ─────────────────────────────────────────────────────

describe("getSubCategoryGroup", () => {
  it("returns the group for a type that has one", () => {
    expect(mod.getSubCategoryGroup("river")).toBe("nature");
    expect(mod.getSubCategoryGroup("museum")).toBe("history_culture");
    expect(mod.getSubCategoryGroup("restaurant")).toBe("food_drink");
  });

  it("returns undefined for a type without a group", () => {
    expect(mod.getSubCategoryGroup("hotel")).toBeUndefined();
  });

  it("returns undefined for an unknown type", () => {
    expect(mod.getSubCategoryGroup("nonexistent")).toBeUndefined();
  });
});

// ─── getCategoryGroupLabel ───────────────────────────────────────────────────

describe("getCategoryGroupLabel", () => {
  it("returns English label for a known group", () => {
    expect(mod.getCategoryGroupLabel("nature", "en")).toBe("Nature");
  });

  it("returns Hebrew label for a known group", () => {
    expect(mod.getCategoryGroupLabel("nature", "he")).toBe("טבע");
  });

  it("returns the raw key for an unknown group", () => {
    expect(mod.getCategoryGroupLabel("unknown_group", "en")).toBe(
      "unknown_group"
    );
  });
});

// ─── getSubCategoriesForPOICategory ──────────────────────────────────────────

describe("getSubCategoriesForPOICategory", () => {
  it("returns subcategories for 'attraction' (Activities + Events)", () => {
    const entries = mod.getSubCategoriesForPOICategory("attraction");
    expect(entries.length).toBeGreaterThan(0);
    // Should include non-geo Activities items
    const types = entries.map((e) => e.type);
    expect(types).toContain("museum");
    expect(types).toContain("festival");
  });

  it("excludes geo-location entries", () => {
    const entries = mod.getSubCategoriesForPOICategory("attraction");
    // 'river' is Activities but is_geo_location=true, so it should be excluded
    const types = entries.map((e) => e.type);
    expect(types).not.toContain("river");
  });

  it("returns subcategories for 'eatery'", () => {
    const entries = mod.getSubCategoriesForPOICategory("eatery");
    expect(entries.length).toBeGreaterThan(0);
    const types = entries.map((e) => e.type);
    expect(types).toContain("restaurant");
    expect(types).toContain("cafe");
  });

  it("returns empty array for unknown category", () => {
    expect(mod.getSubCategoriesForPOICategory("nonexistent")).toEqual([]);
  });
});

// ─── getTransportSubCategories ───────────────────────────────────────────────

describe("getTransportSubCategories", () => {
  it("returns non-empty array of transport entries", () => {
    const entries = mod.getTransportSubCategories();
    expect(entries.length).toBeGreaterThan(0);
    const types = entries.map((e) => e.type);
    expect(types).toContain("car");
    expect(types).toContain("bus");
  });

  it("only contains Transportation category items", () => {
    const entries = mod.getTransportSubCategories();
    for (const entry of entries) {
      expect(entry.category).toBe("Transportation");
    }
  });
});

// ─── getTypeToCategoryMap ────────────────────────────────────────────────────

describe("getTypeToCategoryMap", () => {
  it("returns a non-empty mapping", () => {
    const map = mod.getTypeToCategoryMap();
    expect(Object.keys(map).length).toBeGreaterThan(0);
  });

  it("maps types to their DB category names", () => {
    const map = mod.getTypeToCategoryMap();
    expect(map["restaurant"]).toBe("eatery");
    expect(map["hotel"]).toBe("accommodation");
    expect(map["car"]).toBe("transportation");
    expect(map["museum"]).toBe("attraction");
    expect(map["sim_card"]).toBe("service");
    expect(map["tour_guide"]).toBe("contact");
  });

  it("does not include types from categories with null db_name", () => {
    const map = mod.getTypeToCategoryMap();
    // Tips and Geography have db_name: null
    expect(map["best_time_visit"]).toBeUndefined();
    expect(map["continent"]).toBeUndefined();
  });
});

// ─── getGeoTypes ─────────────────────────────────────────────────────────────

describe("getGeoTypes", () => {
  it("returns a non-empty set", () => {
    const geoTypes = mod.getGeoTypes();
    expect(geoTypes.size).toBeGreaterThan(0);
  });

  it("contains geo-location types", () => {
    const geoTypes = mod.getGeoTypes();
    expect(geoTypes.has("continent")).toBe(true);
    expect(geoTypes.has("country")).toBe(true);
    expect(geoTypes.has("river")).toBe(true);
  });

  it("does not contain non-geo types", () => {
    const geoTypes = mod.getGeoTypes();
    expect(geoTypes.has("restaurant")).toBe(false);
    expect(geoTypes.has("hotel")).toBe(false);
  });
});

// ─── getTipTypes ─────────────────────────────────────────────────────────────

describe("getTipTypes", () => {
  it("returns a non-empty set", () => {
    const tipTypes = mod.getTipTypes();
    expect(tipTypes.size).toBeGreaterThan(0);
  });

  it("contains tip types", () => {
    const tipTypes = mod.getTipTypes();
    expect(tipTypes.has("best_time_visit")).toBe(true);
    expect(tipTypes.has("safety_tip")).toBe(true);
  });

  it("does not contain non-tip types", () => {
    const tipTypes = mod.getTipTypes();
    expect(tipTypes.has("restaurant")).toBe(false);
  });
});

// ─── getCategoryLabel ────────────────────────────────────────────────────────

describe("getCategoryLabel", () => {
  it("returns English label for a known DB category", () => {
    expect(mod.getCategoryLabel("attraction", "en")).toBe("Attractions");
    expect(mod.getCategoryLabel("eatery", "en")).toBe("Eateries");
  });

  it("returns Hebrew label when lang is 'he'", () => {
    expect(mod.getCategoryLabel("attraction", "he")).toBe("אטרקציות");
    expect(mod.getCategoryLabel("eatery", "he")).toBe("אוכל");
  });

  it("returns the raw db category for unknown categories", () => {
    expect(mod.getCategoryLabel("nonexistent", "en")).toBe("nonexistent");
  });
});

// ─── getCategoryColor ────────────────────────────────────────────────────────

describe("getCategoryColor", () => {
  it("returns the color class for a known DB category", () => {
    expect(mod.getCategoryColor("attraction")).toBe("text-blue-500");
    expect(mod.getCategoryColor("eatery")).toBe("text-orange-500");
    expect(mod.getCategoryColor("accommodation")).toBe("text-indigo-500");
  });

  it("returns fallback gray for unknown categories", () => {
    expect(mod.getCategoryColor("nonexistent")).toBe("text-gray-500");
  });
});

// ─── getPOICategories ────────────────────────────────────────────────────────

describe("getPOICategories", () => {
  it("returns a non-empty list", () => {
    const cats = mod.getPOICategories();
    expect(cats.length).toBeGreaterThan(0);
  });

  it("contains expected POI categories", () => {
    const cats = mod.getPOICategories();
    expect(cats).toContain("attraction");
    expect(cats).toContain("eatery");
    expect(cats).toContain("accommodation");
    expect(cats).toContain("service");
  });

  it("excludes transportation and contact", () => {
    const cats = mod.getPOICategories();
    expect(cats).not.toContain("transportation");
    expect(cats).not.toContain("contact");
  });

  it("does not contain duplicates", () => {
    const cats = mod.getPOICategories();
    const unique = new Set(cats);
    expect(unique.size).toBe(cats.length);
  });

  it("does not include categories with null db_name", () => {
    const cats = mod.getPOICategories();
    // Tips and Geography have db_name: null
    expect(cats).not.toContain(null);
  });
});
