import { describe, it, expect } from "vitest";
import {
  buildLocationTree,
  findInFlatList,
  getDescendantNames,
  flattenTripLocations,
  TripLocation,
} from "./tripLocationService";

// ── Test data helpers ───────────────────────────

function makeLoc(
  overrides: Partial<TripLocation> & Pick<TripLocation, "id" | "name" | "siteType">,
): TripLocation {
  return {
    tripId: "trip-1",
    parentId: null,
    externalId: null,
    sortOrder: 0,
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// Reusable multi-level hierarchy:
//   Italy (country)
//   ├── Tuscany (region)
//   │   ├── Florence (city)
//   │   └── Siena (city)
//   └── Lazio (region)
//       └── Rome (city)
//   Japan (country)
//   └── Kansai (region)
//       └── Kyoto (city)

const italy = makeLoc({ id: "1", name: "Italy", siteType: "country" });
const tuscany = makeLoc({ id: "2", name: "Tuscany", siteType: "region", parentId: "1" });
const florence = makeLoc({ id: "3", name: "Florence", siteType: "city", parentId: "2" });
const siena = makeLoc({ id: "4", name: "Siena", siteType: "city", parentId: "2" });
const lazio = makeLoc({ id: "5", name: "Lazio", siteType: "region", parentId: "1" });
const rome = makeLoc({ id: "6", name: "Rome", siteType: "city", parentId: "5" });
const japan = makeLoc({ id: "7", name: "Japan", siteType: "country" });
const kansai = makeLoc({ id: "8", name: "Kansai", siteType: "region", parentId: "7" });
const kyoto = makeLoc({ id: "9", name: "Kyoto", siteType: "city", parentId: "8" });

const fullHierarchy = [italy, tuscany, florence, siena, lazio, rome, japan, kansai, kyoto];

// ── buildLocationTree ───────────────────────────

describe("buildLocationTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildLocationTree([])).toEqual([]);
  });

  it("returns a single root node with no children", () => {
    const result = buildLocationTree([italy]);
    expect(result).toEqual([
      { site: "Italy", site_type: "country", sub_sites: undefined },
    ]);
  });

  it("builds a parent-child relationship", () => {
    const result = buildLocationTree([italy, tuscany]);
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe("Italy");
    expect(result[0].sub_sites).toHaveLength(1);
    expect(result[0].sub_sites![0].site).toBe("Tuscany");
  });

  it("builds a multi-level hierarchy", () => {
    const result = buildLocationTree(fullHierarchy);

    // Two root countries
    expect(result).toHaveLength(2);
    const italyNode = result.find((n) => n.site === "Italy")!;
    const japanNode = result.find((n) => n.site === "Japan")!;

    // Italy has 2 regions
    expect(italyNode.sub_sites).toHaveLength(2);
    const tuscanyNode = italyNode.sub_sites!.find((n) => n.site === "Tuscany")!;
    const lazioNode = italyNode.sub_sites!.find((n) => n.site === "Lazio")!;

    // Tuscany has 2 cities
    expect(tuscanyNode.sub_sites).toHaveLength(2);
    expect(tuscanyNode.sub_sites!.map((n) => n.site).sort()).toEqual(["Florence", "Siena"]);

    // Lazio has 1 city
    expect(lazioNode.sub_sites).toHaveLength(1);
    expect(lazioNode.sub_sites![0].site).toBe("Rome");

    // Japan → Kansai → Kyoto
    expect(japanNode.sub_sites).toHaveLength(1);
    expect(japanNode.sub_sites![0].site).toBe("Kansai");
    expect(japanNode.sub_sites![0].sub_sites).toHaveLength(1);
    expect(japanNode.sub_sites![0].sub_sites![0].site).toBe("Kyoto");
  });

  it("leaf nodes have sub_sites as undefined, not empty array", () => {
    const result = buildLocationTree([italy, tuscany, florence]);
    const florenceNode = result[0].sub_sites![0].sub_sites![0];
    expect(florenceNode.sub_sites).toBeUndefined();
  });

  it("preserves external_id when present", () => {
    const loc = makeLoc({ id: "x", name: "Test", siteType: "city", externalId: "ext-123" });
    const result = buildLocationTree([loc]);
    expect(result[0].external_id).toBe("ext-123");
  });

  it("does not include external_id when null", () => {
    const result = buildLocationTree([italy]);
    expect(result[0].external_id).toBeUndefined();
  });
});

// ── findInFlatList ──────────────────────────────

describe("findInFlatList", () => {
  it("returns undefined for empty list", () => {
    expect(findInFlatList([], "Florence")).toBeUndefined();
  });

  it("finds a location by exact name", () => {
    const result = findInFlatList(fullHierarchy, "Florence");
    expect(result).toBeDefined();
    expect(result!.id).toBe("3");
    expect(result!.name).toBe("Florence");
  });

  it("is case-insensitive", () => {
    expect(findInFlatList(fullHierarchy, "florence")).toBeDefined();
    expect(findInFlatList(fullHierarchy, "FLORENCE")).toBeDefined();
    expect(findInFlatList(fullHierarchy, "FlOrEnCe")).toBeDefined();
  });

  it("returns undefined when name is not found", () => {
    expect(findInFlatList(fullHierarchy, "Barcelona")).toBeUndefined();
  });

  it("returns the first match if duplicates existed", () => {
    const duplicate = makeLoc({ id: "99", name: "Florence", siteType: "city" });
    const result = findInFlatList([...fullHierarchy, duplicate], "Florence");
    expect(result!.id).toBe("3"); // first one wins
  });
});

// ── getDescendantNames ──────────────────────────

describe("getDescendantNames", () => {
  it("returns empty set when ancestor is not found", () => {
    const names = getDescendantNames(fullHierarchy, "Narnia");
    expect(names.size).toBe(0);
  });

  it("returns only the ancestor (lowercased) for a leaf node", () => {
    const names = getDescendantNames(fullHierarchy, "Kyoto");
    expect(names).toEqual(new Set(["kyoto"]));
  });

  it("includes self and all descendants", () => {
    const names = getDescendantNames(fullHierarchy, "Italy");
    expect(names).toEqual(
      new Set(["italy", "tuscany", "florence", "siena", "lazio", "rome"]),
    );
  });

  it("works for a mid-level node", () => {
    const names = getDescendantNames(fullHierarchy, "Tuscany");
    expect(names).toEqual(new Set(["tuscany", "florence", "siena"]));
  });

  it("is case-insensitive for ancestor lookup", () => {
    const names = getDescendantNames(fullHierarchy, "JAPAN");
    expect(names).toEqual(new Set(["japan", "kansai", "kyoto"]));
  });

  it("handles single-element input", () => {
    const names = getDescendantNames([italy], "Italy");
    expect(names).toEqual(new Set(["italy"]));
  });

  it("returns empty set for empty input", () => {
    const names = getDescendantNames([], "Italy");
    expect(names.size).toBe(0);
  });
});

// ── flattenTripLocations ────────────────────────

describe("flattenTripLocations", () => {
  it("returns empty array for empty input", () => {
    expect(flattenTripLocations([])).toEqual([]);
  });

  it("filters out country-type locations", () => {
    const result = flattenTripLocations(fullHierarchy);
    const labels = result.map((r) => r.label);
    expect(labels).not.toContain("Italy");
    expect(labels).not.toContain("Japan");
  });

  it("includes regions and cities", () => {
    const result = flattenTripLocations(fullHierarchy);
    const labels = result.map((r) => r.label);
    expect(labels).toContain("Tuscany");
    expect(labels).toContain("Florence");
    expect(labels).toContain("Rome");
    expect(labels).toContain("Kyoto");
  });

  it("builds correct breadcrumb path for a city", () => {
    const result = flattenTripLocations(fullHierarchy);
    const florenceEntry = result.find((r) => r.label === "Florence")!;
    expect(florenceEntry.path).toEqual(["Italy", "Tuscany", "Florence"]);
    expect(florenceEntry.depth).toBe(2);
  });

  it("builds correct breadcrumb path for a region", () => {
    const result = flattenTripLocations(fullHierarchy);
    const tuscanyEntry = result.find((r) => r.label === "Tuscany")!;
    expect(tuscanyEntry.path).toEqual(["Italy", "Tuscany"]);
    expect(tuscanyEntry.depth).toBe(1);
  });

  it("preserves siteType in output", () => {
    const result = flattenTripLocations(fullHierarchy);
    const florenceEntry = result.find((r) => r.label === "Florence")!;
    expect(florenceEntry.siteType).toBe("city");
    const tuscanyEntry = result.find((r) => r.label === "Tuscany")!;
    expect(tuscanyEntry.siteType).toBe("region");
  });

  it("handles a flat list with no parents gracefully", () => {
    const cities = [
      makeLoc({ id: "a", name: "Paris", siteType: "city" }),
      makeLoc({ id: "b", name: "London", siteType: "city" }),
    ];
    const result = flattenTripLocations(cities);
    expect(result).toHaveLength(2);
    expect(result[0].path).toEqual(["Paris"]);
    expect(result[0].depth).toBe(0);
  });

  it("single country with no children yields empty result", () => {
    const result = flattenTripLocations([italy]);
    expect(result).toEqual([]);
  });
});
