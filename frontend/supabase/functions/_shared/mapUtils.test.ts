import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { buildSiteToCountryMap } from "./mapUtils.ts";

// ── buildSiteToCountryMap ────────────────────────────────────────────────────

Deno.test("buildSiteToCountryMap — empty hierarchy returns empty map", () => {
  assertEquals(buildSiteToCountryMap([]), {});
});

Deno.test("buildSiteToCountryMap — single country with one city", () => {
  const hierarchy = [
    { site: "France", site_type: "country", sub_sites: [
      { site: "Paris", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["paris"], "France");
});

Deno.test("buildSiteToCountryMap — multiple cities under one country", () => {
  const hierarchy = [
    { site: "Japan", site_type: "country", sub_sites: [
      { site: "Tokyo", site_type: "city", sub_sites: [] },
      { site: "Osaka", site_type: "city", sub_sites: [] },
      { site: "Kyoto", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["tokyo"], "Japan");
  assertEquals(map["osaka"], "Japan");
  assertEquals(map["kyoto"], "Japan");
});

Deno.test("buildSiteToCountryMap — multiple countries in hierarchy", () => {
  const hierarchy = [
    { site: "France", site_type: "country", sub_sites: [
      { site: "Paris", site_type: "city", sub_sites: [] },
    ]},
    { site: "Germany", site_type: "country", sub_sites: [
      { site: "Berlin", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["paris"], "France");
  assertEquals(map["berlin"], "Germany");
});

Deno.test("buildSiteToCountryMap — keys are always lowercased", () => {
  const hierarchy = [
    { site: "Thailand", site_type: "country", sub_sites: [
      { site: "Bangkok", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["bangkok"], "Thailand");
  assertEquals(map["Bangkok"], undefined);
});

Deno.test("buildSiteToCountryMap — nested hierarchy (country → region → city)", () => {
  const hierarchy = [
    { site: "USA", site_type: "country", sub_sites: [
      { site: "California", site_type: "region", sub_sites: [
        { site: "Los Angeles", site_type: "city", sub_sites: [] },
        { site: "San Francisco", site_type: "city", sub_sites: [] },
      ]},
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["los angeles"], "USA");
  assertEquals(map["san francisco"], "USA");
  assertEquals(map["california"], "USA");
});

Deno.test("buildSiteToCountryMap — unknown site returns undefined", () => {
  const hierarchy = [
    { site: "Italy", site_type: "country", sub_sites: [
      { site: "Rome", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["madrid"], undefined);
  assertEquals(map["london"], undefined);
});

Deno.test("buildSiteToCountryMap — country node itself maps to country", () => {
  const hierarchy = [
    { site: "Spain", site_type: "country", sub_sites: [
      { site: "Madrid", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["spain"], "Spain");
  assertEquals(map["madrid"], "Spain");
});

Deno.test("buildSiteToCountryMap — non-country top-level nodes are ignored", () => {
  const hierarchy = [
    { site: "Europe", site_type: "continent", sub_sites: [
      { site: "Paris", site_type: "city", sub_sites: [] },
    ]},
  ];
  const map = buildSiteToCountryMap(hierarchy);
  assertEquals(map["paris"], undefined);
  assertEquals(map["europe"], undefined);
});
