import { corsHeaders } from '../_shared/cors.ts';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.550.0';

/**
 * Edge function: search Google Custom Search + YouTube Data API for travel
 * resources per country, merge with existing results, save to S3 as JSON.
 *
 * POST { country: string, lang?: 'en'|'he', location_id?: string, location_name?: string }
 *
 * Language support:
 * - Each resource is tagged with `lang`
 * - The file tracks `searched_langs` so we know which languages were already fetched
 * - Searches are run in the requested language (query terms + API params)
 *
 * Returns { status, new_resources, file }
 */

const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-central-1';
const S3_BUCKET = Deno.env.get('S3_DOCUMENTS_BUCKET') || 'triptomat-media';
const GOOGLE_CSE_API_KEY = Deno.env.get('GOOGLE_CSE_API_KEY') || '';
const GOOGLE_CSE_ID = Deno.env.get('GOOGLE_CSE_ID') || '';
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY') || '';

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  },
});

// ── Types ──

type Lang = 'en' | 'he';
type ResourceCategory = 'general' | 'attractions' | 'food' | 'hotels' | 'transport' | 'nightlife';
type ResourceSourceType = 'youtube' | 'article' | 'facebook' | 'instagram' | 'tiktok' | 'other';

interface Resource {
  id: string;
  source_type: ResourceSourceType;
  category: ResourceCategory;
  lang: Lang;
  title: string;
  url: string;
  thumbnail: string | null;
  snippet: string | null;
  channel: string | null;
  published_at: string | null;
  location_id: string | null;
}

interface ResourceFile {
  country: string;
  searched_at: string;
  searched_langs: Lang[];
  resources: Resource[];
}

// ── Helpers ──

function classifyUrl(url: string): ResourceSourceType {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('facebook.com') || u.includes('fb.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  return 'article';
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// ── Language-specific search queries per category ──

interface SearchSpec {
  category: ResourceCategory;
  queries: { google: string[]; youtube: { q: string; max: number }[] };
}

function buildSearchSpecs(place: string, lang: Lang): SearchSpec[] {
  if (lang === 'he') {
    return [
      {
        category: 'general',
        queries: {
          google: [
            `${place} מדריך טיול`,
            `${place} טיפים לטיול`,
          ],
          youtube: [
            { q: `${place} מדריך טיול`, max: 15 },
          ],
        },
      },
      {
        category: 'attractions',
        queries: {
          google: [
            `${place} מקומות מומלצים לביקור`,
            `${place} מה לעשות אטרקציות`,
            `${place} ולוג טיול site:youtube.com`,
          ],
          youtube: [
            { q: `${place} מה לעשות טיול`, max: 10 },
          ],
        },
      },
      {
        category: 'food',
        queries: {
          google: [
            `${place} מסעדות מומלצות אוכל`,
            `${place} אוכל רחוב איפה לאכול`,
          ],
          youtube: [
            { q: `${place} סיור אוכל`, max: 10 },
          ],
        },
      },
      {
        category: 'hotels',
        queries: {
          google: [
            `${place} מלונות מומלצים איפה לישון`,
            `${place} לינה מומלצת`,
          ],
          youtube: [],
        },
      },
      {
        category: 'nightlife',
        queries: {
          google: [
            `${place} חיי לילה ברים מועדונים`,
          ],
          youtube: [],
        },
      },
    ];
  }

  // English (default)
  return [
    {
      category: 'general',
      queries: {
        google: [
          `${place} travel guide`,
          `${place} travel tips`,
        ],
        youtube: [
          { q: `${place} travel guide`, max: 15 },
        ],
      },
    },
    {
      category: 'attractions',
      queries: {
        google: [
          `${place} best places to visit`,
          `${place} things to do`,
          `${place} travel vlog site:youtube.com`,
        ],
        youtube: [
          { q: `${place} things to do`, max: 10 },
        ],
      },
    },
    {
      category: 'food',
      queries: {
        google: [
          `${place} best restaurants food`,
          `${place} street food where to eat`,
        ],
        youtube: [
          { q: `${place} food tour`, max: 10 },
        ],
      },
    },
    {
      category: 'hotels',
      queries: {
        google: [
          `${place} best hotels where to stay`,
          `${place} accommodation guide`,
        ],
        youtube: [],
      },
    },
    {
      category: 'nightlife',
      queries: {
        google: [
          `${place} nightlife bars clubs`,
        ],
        youtube: [],
      },
    },
  ];
}

// ── Google Custom Search ──

async function googleSearch(query: string, lang: Lang, category: ResourceCategory, locationId: string | null): Promise<Resource[]> {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_ID) return [];
  try {
    const params = new URLSearchParams({
      key: GOOGLE_CSE_API_KEY,
      cx: GOOGLE_CSE_ID,
      q: query,
      num: '10',
      lr: lang === 'he' ? 'lang_iw' : 'lang_en',
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) {
      console.error(`[google-search] ${res.status}: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    return (data.items || [])// eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({
      id: generateId(),
      source_type: classifyUrl(item.link),
      category,
      lang,
      title: item.title || '',
      url: item.link,
      thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src
        || item.pagemap?.cse_image?.[0]?.src
        || null,
      snippet: item.snippet || null,
      channel: new URL(item.link).hostname.replace('www.', ''),
      published_at: null,
      location_id: locationId,
    }));
  } catch (err) {
    console.error('[google-search] error:', err);
    return [];
  }
}

// ── YouTube Data API ──

async function youtubeSearch(query: string, maxResults: number, lang: Lang, category: ResourceCategory, locationId: string | null): Promise<Resource[]> {
  if (!YOUTUBE_API_KEY) return [];
  try {
    const params = new URLSearchParams({
      key: YOUTUBE_API_KEY,
      part: 'snippet',
      type: 'video',
      q: query,
      maxResults: String(maxResults),
      relevanceLanguage: lang === 'he' ? 'iw' : 'en',
      order: 'relevance',
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) {
      console.error(`[youtube-search] ${res.status}: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    return (data.items || [])// eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({
      id: generateId(),
      source_type: 'youtube' as const,
      category,
      lang,
      title: item.snippet?.title || '',
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      thumbnail: item.snippet?.thumbnails?.high?.url
        || item.snippet?.thumbnails?.medium?.url
        || item.snippet?.thumbnails?.default?.url
        || null,
      snippet: item.snippet?.description || null,
      channel: item.snippet?.channelTitle || null,
      published_at: item.snippet?.publishedAt || null,
      location_id: locationId,
    }));
  } catch (err) {
    console.error('[youtube-search] error:', err);
    return [];
  }
}

// Social media search via Google
async function socialSearch(place: string, lang: Lang, locationId: string | null): Promise<Resource[]> {
  const query = lang === 'he'
    ? `${place} טיול site:tiktok.com OR site:instagram.com OR site:facebook.com`
    : `${place} travel site:tiktok.com OR site:instagram.com OR site:facebook.com`;
  return googleSearch(query, lang, 'general', locationId);
}

// ── S3 read/write ──

async function loadExistingFile(country: string): Promise<ResourceFile | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: `resources/${country}.json`,
    });
    const res = await s3.send(command);
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function saveFile(country: string, file: ResourceFile): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: `resources/${country}.json`,
    Body: JSON.stringify(file, null, 2),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=86400',
  });
  await s3.send(command);
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const country = body.country as string;
    const lang: Lang = body.lang === 'he' ? 'he' : 'en';
    const locationId = (body.location_id as string) || null;
    const locationName = (body.location_name as string) || null;

    if (!country || typeof country !== 'string') {
      return new Response(JSON.stringify({ error: 'country is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const searchPlace = locationName || country;
    console.log(`[search-country-resources] Searching for: ${searchPlace} (country: ${country}, lang: ${lang}, location_id: ${locationId})`);

    // Build language-specific search specs
    const specs = buildSearchSpecs(searchPlace, lang);

    // Run all searches in parallel
    const allPromises: Promise<Resource[]>[] = [];
    for (const spec of specs) {
      for (const q of spec.queries.google) {
        allPromises.push(googleSearch(q, lang, spec.category, locationId));
      }
      for (const yt of spec.queries.youtube) {
        allPromises.push(youtubeSearch(yt.q, yt.max, lang, spec.category, locationId));
      }
    }
    allPromises.push(socialSearch(searchPlace, lang, locationId));

    const searchResults = await Promise.all(allPromises);
    const allNewResults = searchResults.flat();
    console.log(`[search-country-resources] Got ${allNewResults.length} raw results for ${searchPlace} [${lang}]`);

    // Load existing file and merge
    const existing = await loadExistingFile(country);
    const existingUrls = new Set((existing?.resources || []).map(r => r.url));
    const uniqueNew = allNewResults.filter(r => !existingUrls.has(r.url));

    // Deduplicate within new results
    const seenUrls = new Set<string>();
    const deduped: Resource[] = [];
    for (const r of uniqueNew) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        deduped.push(r);
      }
    }

    const mergedResources = [...(existing?.resources || []), ...deduped];
    const existingLangs = existing?.searched_langs || [];
    const searchedLangs = existingLangs.includes(lang) ? existingLangs : [...existingLangs, lang];

    const file: ResourceFile = {
      country,
      searched_at: new Date().toISOString(),
      searched_langs: searchedLangs,
      resources: mergedResources,
    };

    await saveFile(country, file);
    console.log(`[search-country-resources] Saved ${mergedResources.length} total resources (${deduped.length} new) for ${country} [langs: ${searchedLangs.join(',')}]`);

    return new Response(JSON.stringify({
      status: 'searched',
      new_resources: deduped,
      file,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[search-country-resources] error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
