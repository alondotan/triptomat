// ── Types ──

export type ResourceCategory = 'general' | 'attractions' | 'food' | 'hotels' | 'transport' | 'nightlife';
export type ResourceSourceType = 'youtube' | 'article' | 'facebook' | 'instagram' | 'tiktok' | 'other';

export type ResourceLang = 'en' | 'he';

export interface CountryResource {
  id: string;
  source_type: ResourceSourceType;
  category: ResourceCategory;
  search_language: ResourceLang;
  title: string;
  url: string;
  thumbnail: string | null;
  snippet: string | null;
  channel: string | null;
  published_at: string | null;
  /** ID from the country location tree (country, region, city, etc.) */
  location_id: string | null;
}

export interface CountryResourceFile {
  country: string;
  country_he?: string;
  country_id?: string;
  searched_at: string;
  resources: CountryResource[];
}

// ── S3 fetch + memory cache ──

const S3_BASE = 'https://triptomat-media.s3.eu-central-1.amazonaws.com';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const resourceCache = new Map<string, CountryResourceFile | null>();

export async function loadCountryResources(country: string): Promise<CountryResourceFile | null> {
  if (resourceCache.has(country)) return resourceCache.get(country)!;

  try {
    const res = await fetch(`${S3_BASE}/resources/${encodeURIComponent(country)}.json`);
    if (!res.ok) {
      resourceCache.set(country, null);
      return null;
    }
    const data: CountryResourceFile = await res.json();
    resourceCache.set(country, data);
    return data;
  } catch {
    resourceCache.set(country, null);
    return null;
  }
}

export function isStale(file: CountryResourceFile): boolean {
  const searchedAt = new Date(file.searched_at).getTime();
  return Date.now() - searchedAt > CACHE_MAX_AGE_MS;
}

/** Check if a specific language is missing or stale in the file */
export function needsLangSearch(file: CountryResourceFile | null, lang: ResourceLang): boolean {
  if (!file) return true;
  const hasLang = file.resources.some(r => r.search_language === lang);
  if (!hasLang) return true;
  return isStale(file);
}

// ── Search trigger (edge function) ──

export async function triggerResourceSearch(country: string, lang: ResourceLang = 'en'): Promise<CountryResource[]> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-country-resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country, lang }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(err.error || 'Search failed');
  }

  const data = await res.json();

  // Update the in-memory cache with the fresh file
  if (data.file) {
    resourceCache.set(country, data.file);
  }

  return data.new_resources || [];
}

// ── Merge helper (deduplicates by URL) ──

export function mergeResources(existing: CountryResource[], incoming: CountryResource[]): CountryResource[] {
  const urlSet = new Set(existing.map(r => r.url));
  const newItems = incoming.filter(r => !urlSet.has(r.url));
  return [...existing, ...newItems];
}

// Invalidate in-memory cache for a country (e.g. after background refresh)
export function invalidateResourceCache(country: string): void {
  resourceCache.delete(country);
}
