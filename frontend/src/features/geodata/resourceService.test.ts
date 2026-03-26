import { describe, it, expect } from "vitest";
import {
  isStale,
  needsLangSearch,
  mergeResources,
  isVideoUrl,
  recommendationsToResources,
  type CountryResourceFile,
  type CountryResource,
} from "./resourceService";

// ── Helpers ──

function makeResource(overrides: Partial<CountryResource> = {}): CountryResource {
  return {
    id: "r1",
    source_type: "youtube",
    category: "general",
    search_language: "en",
    title: "Test Resource",
    url: "https://example.com/video",
    thumbnail: null,
    snippet: null,
    channel: null,
    published_at: null,
    location_id: null,
    ...overrides,
  };
}

function makeFile(overrides: Partial<CountryResourceFile> = {}): CountryResourceFile {
  return {
    country: "Japan",
    searched_at: new Date().toISOString(),
    resources: [],
    ...overrides,
  };
}

// ── isStale ──

describe("isStale", () => {
  it("returns false for a file searched just now", () => {
    const file = makeFile({ searched_at: new Date().toISOString() });
    expect(isStale(file)).toBe(false);
  });

  it("returns false for a file searched 29 days ago", () => {
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const file = makeFile({ searched_at: twentyNineDaysAgo.toISOString() });
    expect(isStale(file)).toBe(false);
  });

  it("returns true for a file searched 31 days ago", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const file = makeFile({ searched_at: thirtyOneDaysAgo.toISOString() });
    expect(isStale(file)).toBe(true);
  });

  it("returns true for a file searched 60 days ago", () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const file = makeFile({ searched_at: sixtyDaysAgo.toISOString() });
    expect(isStale(file)).toBe(true);
  });

  it("handles edge case right at 30 days boundary", () => {
    // Exactly 30 days — should NOT be stale (needs to be strictly greater)
    const exactlyThirtyDays = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const file = makeFile({ searched_at: exactlyThirtyDays.toISOString() });
    // At exactly 30 days, Date.now() - searchedAt === CACHE_MAX_AGE_MS, so > returns false
    expect(isStale(file)).toBe(false);
  });
});

// ── needsLangSearch ──

describe("needsLangSearch", () => {
  it("returns true when file is null", () => {
    expect(needsLangSearch(null, "en")).toBe(true);
  });

  it("returns true when file is null for Hebrew", () => {
    expect(needsLangSearch(null, "he")).toBe(true);
  });

  it("returns true when language is not present in resources", () => {
    const file = makeFile({
      resources: [makeResource({ search_language: "en" })],
    });
    expect(needsLangSearch(file, "he")).toBe(true);
  });

  it("returns false when language is present and file is fresh", () => {
    const file = makeFile({
      searched_at: new Date().toISOString(),
      resources: [makeResource({ search_language: "en" })],
    });
    expect(needsLangSearch(file, "en")).toBe(false);
  });

  it("returns true when language is present but file is stale", () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const file = makeFile({
      searched_at: oldDate.toISOString(),
      resources: [makeResource({ search_language: "en" })],
    });
    expect(needsLangSearch(file, "en")).toBe(true);
  });

  it("returns false when file has resources in both languages and is fresh", () => {
    const file = makeFile({
      searched_at: new Date().toISOString(),
      resources: [
        makeResource({ id: "r1", search_language: "en" }),
        makeResource({ id: "r2", search_language: "he" }),
      ],
    });
    expect(needsLangSearch(file, "en")).toBe(false);
    expect(needsLangSearch(file, "he")).toBe(false);
  });

  it("returns true when file has empty resources array", () => {
    const file = makeFile({ resources: [] });
    expect(needsLangSearch(file, "en")).toBe(true);
  });
});

// ── mergeResources ──

describe("mergeResources", () => {
  it("returns incoming when existing is empty", () => {
    const incoming = [makeResource({ id: "r1", url: "https://a.com" })];
    const result = mergeResources([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://a.com");
  });

  it("returns existing when incoming is empty", () => {
    const existing = [makeResource({ id: "r1", url: "https://a.com" })];
    const result = mergeResources(existing, []);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://a.com");
  });

  it("returns empty array when both are empty", () => {
    expect(mergeResources([], [])).toEqual([]);
  });

  it("deduplicates by URL — skips incoming items with existing URLs", () => {
    const existing = [makeResource({ id: "r1", url: "https://a.com" })];
    const incoming = [
      makeResource({ id: "r2", url: "https://a.com" }), // duplicate
      makeResource({ id: "r3", url: "https://b.com" }), // new
    ];
    const result = mergeResources(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("r1"); // original kept
    expect(result[1].id).toBe("r3"); // new added
  });

  it("keeps all items when no duplicates", () => {
    const existing = [makeResource({ id: "r1", url: "https://a.com" })];
    const incoming = [
      makeResource({ id: "r2", url: "https://b.com" }),
      makeResource({ id: "r3", url: "https://c.com" }),
    ];
    const result = mergeResources(existing, incoming);
    expect(result).toHaveLength(3);
  });

  it("preserves order: existing first, then new incoming", () => {
    const existing = [
      makeResource({ id: "r1", url: "https://a.com" }),
      makeResource({ id: "r2", url: "https://b.com" }),
    ];
    const incoming = [
      makeResource({ id: "r3", url: "https://c.com" }),
      makeResource({ id: "r4", url: "https://d.com" }),
    ];
    const result = mergeResources(existing, incoming);
    expect(result.map(r => r.id)).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("handles all duplicates — returns only existing", () => {
    const existing = [
      makeResource({ id: "r1", url: "https://a.com" }),
      makeResource({ id: "r2", url: "https://b.com" }),
    ];
    const incoming = [
      makeResource({ id: "r3", url: "https://a.com" }),
      makeResource({ id: "r4", url: "https://b.com" }),
    ];
    const result = mergeResources(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(["r1", "r2"]);
  });

  it("URL matching is exact (case-sensitive)", () => {
    const existing = [makeResource({ id: "r1", url: "https://A.com" })];
    const incoming = [makeResource({ id: "r2", url: "https://a.com" })];
    const result = mergeResources(existing, incoming);
    // Different case = different URL, both kept
    expect(result).toHaveLength(2);
  });
});

// ── isVideoUrl ──

describe("isVideoUrl", () => {
  // YouTube
  it("returns true for youtube.com URLs", () => {
    expect(isVideoUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("returns true for youtu.be short URLs", () => {
    expect(isVideoUrl("https://youtu.be/abc123")).toBe(true);
  });

  it("returns true for YouTube with path segments", () => {
    expect(isVideoUrl("https://youtube.com/shorts/abc")).toBe(true);
  });

  // TikTok
  it("returns true for tiktok.com URLs", () => {
    expect(isVideoUrl("https://www.tiktok.com/@user/video/123")).toBe(true);
  });

  // Instagram
  it("returns true for instagram.com URLs", () => {
    expect(isVideoUrl("https://www.instagram.com/reel/abc123/")).toBe(true);
  });

  // Facebook
  it("returns true for facebook.com URLs", () => {
    expect(isVideoUrl("https://www.facebook.com/watch?v=123")).toBe(true);
  });

  it("returns true for fb.watch URLs", () => {
    expect(isVideoUrl("https://fb.watch/abc123/")).toBe(true);
  });

  // Case insensitivity
  it("is case insensitive", () => {
    expect(isVideoUrl("https://WWW.YOUTUBE.COM/watch?v=abc")).toBe(true);
    expect(isVideoUrl("https://TIKTOK.COM/@user")).toBe(true);
  });

  // Non-video URLs
  it("returns false for regular website URLs", () => {
    expect(isVideoUrl("https://www.example.com")).toBe(false);
  });

  it("returns false for blog URLs", () => {
    expect(isVideoUrl("https://blog.travel.com/best-hotels")).toBe(false);
  });

  it("returns false for Wikipedia", () => {
    expect(isVideoUrl("https://en.wikipedia.org/wiki/Japan")).toBe(false);
  });

  it("returns false for TripAdvisor", () => {
    expect(isVideoUrl("https://www.tripadvisor.com/Tourism")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isVideoUrl("")).toBe(false);
  });

  it("matches 'youtube.com' as substring in domain (known behavior)", () => {
    // The regex checks for youtube.com anywhere in the string, so subdomains like
    // notyoutube.com will match. This documents the current behavior.
    expect(isVideoUrl("https://notyoutube.com/video")).toBe(true);
  });
});

// ── recommendationsToResources ──

describe("recommendationsToResources", () => {
  it("converts video URL recommendations to resources", () => {
    const recs = [
      {
        id: "rec1",
        source_url: "https://www.youtube.com/watch?v=abc",
        source_title: "Japan Travel Guide",
        source_image: "https://img.youtube.com/thumb.jpg",
      },
    ];
    const result = recommendationsToResources(recs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "rec1",
      source_type: "youtube",
      category: "general",
      search_language: "en",
      title: "Japan Travel Guide",
      url: "https://www.youtube.com/watch?v=abc",
      thumbnail: "https://img.youtube.com/thumb.jpg",
      snippet: null,
      channel: null,
      published_at: null,
      location_id: null,
    });
  });

  it("filters out non-video URLs", () => {
    const recs = [
      { id: "rec1", source_url: "https://www.youtube.com/watch?v=abc" },
      { id: "rec2", source_url: "https://www.example.com/article" },
      { id: "rec3", source_url: "https://www.tiktok.com/@user/video/123" },
    ];
    const result = recommendationsToResources(recs);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(["rec1", "rec3"]);
  });

  it("filters out recommendations without source_url", () => {
    const recs = [
      { id: "rec1" },
      { id: "rec2", source_url: "https://www.youtube.com/watch?v=abc" },
    ];
    const result = recommendationsToResources(recs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("rec2");
  });

  it("uses source_url as title when source_title is missing", () => {
    const recs = [
      { id: "rec1", source_url: "https://www.youtube.com/watch?v=abc" },
    ];
    const result = recommendationsToResources(recs);
    expect(result[0].title).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("sets thumbnail to null when source_image is missing", () => {
    const recs = [
      { id: "rec1", source_url: "https://www.youtube.com/watch?v=abc" },
    ];
    const result = recommendationsToResources(recs);
    expect(result[0].thumbnail).toBeNull();
  });

  it("classifies TikTok URLs correctly", () => {
    const recs = [
      { id: "rec1", source_url: "https://www.tiktok.com/@user/video/123" },
    ];
    const result = recommendationsToResources(recs);
    expect(result[0].source_type).toBe("tiktok");
  });

  it("classifies Instagram URLs correctly", () => {
    const recs = [
      { id: "rec1", source_url: "https://www.instagram.com/reel/abc/" },
    ];
    const result = recommendationsToResources(recs);
    expect(result[0].source_type).toBe("instagram");
  });

  it("classifies Facebook URLs correctly", () => {
    const recs = [
      { id: "rec1", source_url: "https://www.facebook.com/watch?v=123" },
    ];
    const result = recommendationsToResources(recs);
    expect(result[0].source_type).toBe("facebook");
  });

  it("classifies fb.watch URLs as facebook", () => {
    const recs = [
      { id: "rec1", source_url: "https://fb.watch/abc123/" },
    ];
    const result = recommendationsToResources(recs);
    expect(result[0].source_type).toBe("facebook");
  });

  it("returns empty array for empty input", () => {
    expect(recommendationsToResources([])).toEqual([]);
  });

  it("returns empty array when no video URLs present", () => {
    const recs = [
      { id: "rec1", source_url: "https://blog.com/article" },
      { id: "rec2", source_url: "https://tripadvisor.com/hotel" },
    ];
    expect(recommendationsToResources(recs)).toEqual([]);
  });
});
