import type { SourceRecommendation } from '@/types/webhook';
import type { CountryResource } from '@/services/resourceService';

export type UnifiedSource =
  | { kind: 'recommendation'; data: SourceRecommendation }
  | { kind: 'resource'; data: CountryResource };

export type SourceSection = 'videos' | 'maps' | 'articles' | 'conversations';

const VIDEO_RE = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch/i;
const MAPS_RE = /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/i;

export function classifyRecommendation(rec: SourceRecommendation): SourceSection {
  const url = rec.sourceUrl || '';
  // Text submissions, WhatsApp, and no-URL = conversations
  if (url.startsWith('text://') || url.startsWith('whatsapp://') || !url) return 'conversations';
  const hasMapList = !!(rec.analysis as Record<string, unknown>)?.map_list_id;
  if (hasMapList || MAPS_RE.test(url)) return 'maps';
  if (VIDEO_RE.test(url)) return 'videos';
  return 'articles';
}

export function classifyResource(res: CountryResource): SourceSection {
  if (['youtube', 'tiktok', 'facebook', 'instagram'].includes(res.source_type)) return 'videos';
  return 'articles';
}

export function getSourceSection(source: UnifiedSource): SourceSection {
  return source.kind === 'recommendation'
    ? classifyRecommendation(source.data)
    : classifyResource(source.data);
}

export function getSourceUrl(source: UnifiedSource): string {
  return source.kind === 'recommendation'
    ? (source.data.sourceUrl || '')
    : source.data.url;
}
