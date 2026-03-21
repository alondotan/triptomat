import { corsHeaders } from '../_shared/cors.ts';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.550.0';

/**
 * Edge function: search Google Custom Search + YouTube Data API for travel
 * resources per country, merge with existing results, save to S3 as JSON.
 *
 * POST { country: string }
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

// ── Helpers ──

interface Resource {
  id: string;
  source_type: 'youtube' | 'article' | 'facebook' | 'instagram' | 'tiktok' | 'other';
  title: string;
  url: string;
  thumbnail: string | null;
  snippet: string | null;
  channel: string | null;
  published_at: string | null;
}

interface ResourceFile {
  country: string;
  searched_at: string;
  resources: Resource[];
}

function classifyUrl(url: string): Resource['source_type'] {
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

// ── Google Custom Search ──

async function googleSearch(query: string): Promise<Resource[]> {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_ID) return [];
  try {
    const params = new URLSearchParams({
      key: GOOGLE_CSE_API_KEY,
      cx: GOOGLE_CSE_ID,
      q: query,
      num: '10',
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) {
      console.error(`[google-search] ${res.status}: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      id: generateId(),
      source_type: classifyUrl(item.link),
      title: item.title || '',
      url: item.link,
      thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src
        || item.pagemap?.cse_image?.[0]?.src
        || null,
      snippet: item.snippet || null,
      channel: new URL(item.link).hostname.replace('www.', ''),
      published_at: null,
    }));
  } catch (err) {
    console.error('[google-search] error:', err);
    return [];
  }
}

// ── YouTube Data API ──

async function youtubeSearch(query: string, maxResults = 20): Promise<Resource[]> {
  if (!YOUTUBE_API_KEY) return [];
  try {
    const params = new URLSearchParams({
      key: YOUTUBE_API_KEY,
      part: 'snippet',
      type: 'video',
      q: query,
      maxResults: String(maxResults),
      relevanceLanguage: 'en',
      order: 'relevance',
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) {
      console.error(`[youtube-search] ${res.status}: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      id: generateId(),
      source_type: 'youtube' as const,
      title: item.snippet?.title || '',
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      thumbnail: item.snippet?.thumbnails?.high?.url
        || item.snippet?.thumbnails?.medium?.url
        || item.snippet?.thumbnails?.default?.url
        || null,
      snippet: item.snippet?.description || null,
      channel: item.snippet?.channelTitle || null,
      published_at: item.snippet?.publishedAt || null,
    }));
  } catch (err) {
    console.error('[youtube-search] error:', err);
    return [];
  }
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
    CacheControl: 'public, max-age=86400', // CDN cache 1 day
  });
  await s3.send(command);
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { country } = await req.json();
    if (!country || typeof country !== 'string') {
      return new Response(JSON.stringify({ error: 'country is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[search-country-resources] Searching for: ${country}`);

    // Run all searches in parallel
    const searchResults = await Promise.all([
      // Google searches
      googleSearch(`${country} travel guide`),
      googleSearch(`${country} best places to visit`),
      googleSearch(`${country} things to do`),
      googleSearch(`${country} travel tips`),
      googleSearch(`${country} travel vlog site:youtube.com`),
      googleSearch(`${country} travel site:tiktok.com OR site:instagram.com OR site:facebook.com`),
      // YouTube searches
      youtubeSearch(`${country} travel guide`, 20),
      youtubeSearch(`${country} things to do`, 10),
      youtubeSearch(`${country} food tour`, 10),
    ]);

    const allNewResults = searchResults.flat();
    console.log(`[search-country-resources] Got ${allNewResults.length} raw results for ${country}`);

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

    const file: ResourceFile = {
      country,
      searched_at: new Date().toISOString(),
      resources: mergedResources,
    };

    await saveFile(country, file);
    console.log(`[search-country-resources] Saved ${mergedResources.length} total resources (${deduped.length} new) for ${country}`);

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
