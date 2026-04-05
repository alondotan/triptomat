import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { useTransport } from '@/features/transport/TransportContext';
import { useContacts } from '@/features/itinerary/ItineraryContext';
import { AppLayout } from '@/shared/components/layout';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { POIDetailDialog } from '@/features/poi/POIDetailDialog';
import { ContactEditDialog } from '@/shared/components/ContactEditDialog';
import { SubCategoryIcon } from '@/shared/components/SubCategoryIcon';
import {
  ExternalLink, Youtube, Globe, Loader2, RefreshCw, Sparkles,
  X, FileText, ThumbsUp, ThumbsDown, Trash2, ChevronDown, ChevronUp,
  Users, AlertTriangle, RotateCw, MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  loadCountryResources,
  triggerResourceSearch,
  needsLangSearch,
  mergeResources,
  invalidateResourceCache,
  type CountryResource,
  type ResourceCategory,
  type ResourceLang,
} from '@/features/geodata/resourceService';
import { fetchTripRecommendations, deleteRecommendation } from '@/features/inbox/recommendationService';
import type { SourceRecommendation } from '@/types/webhook';
import type { PointOfInterest, Contact } from '@/types/trip';
import type { UnifiedSource, SourceSection } from '@/types/source';
import { getSourceSection, getSourceUrl } from '@/types/source';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/shared/hooks/use-toast';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Platform config ──

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: 'bg-red-100 text-red-700 border-red-200' },
  facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  instagram: { label: 'Instagram', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  tiktok: { label: 'TikTok', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  article: { label: 'Article', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const LANG_CONFIG: Record<string, { label: string; flag: string }> = {
  en: { label: 'EN', flag: '\u{1F1EC}\u{1F1E7}' },
  he: { label: 'HE', flag: '\u{1F1EE}\u{1F1F1}' },
};

const CATEGORIES: { key: ResourceCategory | 'all'; labelKey: string; color: string }[] = [
  { key: 'all', labelKey: 'resourcesPage.allCategories', color: '' },
  { key: 'attractions', labelKey: 'resourcesPage.catAttractions', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'food', labelKey: 'resourcesPage.catFood', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { key: 'hotels', labelKey: 'resourcesPage.catHotels', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { key: 'nightlife', labelKey: 'resourcesPage.catNightlife', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  { key: 'general', labelKey: 'resourcesPage.catGeneral', color: 'bg-sky-100 text-sky-700 border-sky-200' },
];

const SECTIONS: { key: SourceSection; labelKey: string; icon: typeof Youtube; iconColor: string }[] = [
  { key: 'videos', labelKey: 'sourcesPage.tabVideos', icon: Youtube, iconColor: 'text-red-500' },
  { key: 'maps', labelKey: 'sourcesPage.tabMaps', icon: Globe, iconColor: 'text-blue-500' },
  { key: 'articles', labelKey: 'sourcesPage.tabArticles', icon: ExternalLink, iconColor: 'text-emerald-500' },
  { key: 'conversations', labelKey: 'sourcesPage.tabConversations', icon: Sparkles, iconColor: 'text-purple-500' },
];

// ── Helpers ──

/** Google Maps logo placeholder for maps recommendations */
function MapPlaceholder() {
  return (
    <div className="w-full h-40 bg-[#f0f4f8] dark:bg-slate-800 flex items-center justify-center">
      <img src="https://www.gstatic.com/mapspro/images/stock/20333-saved-702x336.png" alt="Google Maps"
        className="w-full h-full object-cover" onError={(e) => {
          const el = e.target as HTMLImageElement;
          el.style.display = 'none';
          el.parentElement!.innerHTML = '<div class="flex items-center gap-2 text-muted-foreground"><svg width="32" height="32" viewBox="0 0 92.3 132.3" fill="none"><path d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z" fill="#1a73e8"/><path d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-32.4L10.8 16.5z" fill="#ea4335"/><path d="M46.1 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4l27.5-31.9C81.4 10.8 68.3 0 53.4 0c-2.5 0-4.9.3-7.3.8L32.6 34.8c3.5-3.8 8.5-6.3 13.5-6.3z" fill="#4285f4"/><path d="M46.1 63.5c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.6-8.3 4.2-11.4L4.6 68.1C13.2 86.5 32 117.8 46.1 132.3c14.2-14.5 33-45.8 41.6-64.2l-27.5-31.9c-3.4 3.9-8.4 6.3-14.1 6.3z" fill="#fbbc04"/><path d="M59.6 59.5c-2.6 3.1-6.4 4-13.5 4-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.6-8.3 4.2-11.4L4.6 68.1C13.2 86.5 32 117.8 46.1 132.3c14.2-14.5 33-45.8 41.6-64.2L59.6 59.5z" fill="#34a853"/></svg></div>';
        }} />
    </div>
  );
}

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v');
    }
  } catch { /* ignore */ }
  return null;
}

// ── Resource card (S3 resources) ──

function ResourceCardContent({ resource, analyzed, onAnalyze, analyzing }: {
  resource: CountryResource;
  analyzed: boolean;
  onAnalyze?: (url: string) => void;
  analyzing?: boolean;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const isVideo = ['youtube', 'tiktok', 'facebook', 'instagram'].includes(resource.source_type);
  const youtubeId = resource.source_type === 'youtube' ? getYouTubeId(resource.url) : null;
  const canEmbed = !!youtubeId;

  const platform = PLATFORM_CONFIG[resource.source_type] || PLATFORM_CONFIG.other;
  const category = CATEGORIES.find(c => c.key === resource.category);
  const langCfg = resource.search_language ? LANG_CONFIG[resource.search_language] : null;

  return (
    <div className="group rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow">
      {playing && youtubeId ? (
        <>
          <div className="relative w-full aspect-video bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title={resource.title}
            />
            <button
              onClick={() => setPlaying(false)}
              className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-3">
            <h3 className="font-medium text-sm line-clamp-2">{resource.title}</h3>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${platform.color}`}>{platform.label}</Badge>
              {analyzed && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                  <Sparkles size={10} className="me-0.5" />{t('sourcesPage.analyzed')}
                </Badge>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            onClick={(e) => { if (canEmbed) { e.preventDefault(); setPlaying(true); } }}
          >
            {isVideo && resource.thumbnail ? (
              <div className="relative w-full aspect-video bg-muted overflow-hidden">
                <img src={resource.thumbnail} alt={resource.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                {resource.source_type === 'youtube' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-red-600/90 rounded-full p-3"><Youtube size={24} className="text-white" /></div>
                  </div>
                )}
              </div>
            ) : null}
            {!isVideo || !resource.thumbnail ? (
              <div className="flex gap-3 p-3">
                {resource.thumbnail && (
                  <div className="shrink-0 w-24 h-24 rounded overflow-hidden bg-muted">
                    <img src={resource.thumbnail} alt={resource.title} className="w-full h-full object-cover" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">{resource.title}</h3>
                  {resource.snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resource.snippet}</p>}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${platform.color}`}>{platform.label}</Badge>
                    {category && category.key !== 'all' && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${category.color}`}>{category.labelKey.split('.').pop()}</Badge>
                    )}
                    {langCfg && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200">{langCfg.flag} {langCfg.label}</Badge>
                    )}
                    {analyzed && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                        <Sparkles size={10} className="me-0.5" />{t('sourcesPage.analyzed')}
                      </Badge>
                    )}
                    {resource.channel && <span className="text-[10px] text-muted-foreground truncate">{resource.channel}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 pb-0">
                <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">{resource.title}</h3>
                {resource.snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resource.snippet}</p>}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${platform.color}`}>{platform.label}</Badge>
                  {category && category.key !== 'all' && (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${category.color}`}>{category.labelKey.split('.').pop()}</Badge>
                  )}
                  {langCfg && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200">{langCfg.flag} {langCfg.label}</Badge>
                  )}
                  {analyzed && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                      <Sparkles size={10} className="me-0.5" />{t('sourcesPage.analyzed')}
                    </Badge>
                  )}
                  {resource.channel && <span className="text-[10px] text-muted-foreground truncate">{resource.channel}</span>}
                </div>
              </div>
            )}
          </a>
          {onAnalyze && !analyzed && (
            <div className="px-3 pb-2 pt-1">
              <Button variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground hover:text-primary"
                disabled={analyzing} onClick={() => onAnalyze(resource.url)}>
                {analyzing ? <Loader2 size={12} className="animate-spin me-1" /> : <Sparkles size={12} className="me-1" />}
                {t('sourcesPage.analyze')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Recommendation card ──

function RecommendationCardContent({ rec, pois, transportation, contacts, expandedId, setExpandedId, onDelete, onResend, onRefreshMapList, syncing, setSourceTextDialog, setSelectedPoi, setSelectedContact }: {
  rec: SourceRecommendation;
  pois: PointOfInterest[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transportation: any[];
  contacts: Contact[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onDelete: (id: string) => void;
  onResend: (rec: SourceRecommendation) => void;
  onRefreshMapList: (rec: SourceRecommendation) => void;
  syncing: Record<string, boolean>;
  setSourceTextDialog: (d: { title: string; text: string } | null) => void;
  setSelectedPoi: (p: PointOfInterest | null) => void;
  setSelectedContact: (c: Contact | null) => void;
}) {
  const { t } = useTranslation();
  const isVideo = rec.sourceUrl ? /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch/i.test(rec.sourceUrl) : false;
  const youtubeId = rec.sourceUrl && isVideo ? getYouTubeId(rec.sourceUrl) : null;
  const [playing, setPlaying] = useState(false);

  // Status badges
  const statusBadge = rec.status === 'processing'
    ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-600 border-orange-300"><Loader2 size={10} className="animate-spin me-0.5" />{t('recsPage.processing')}</Badge>
    : rec.status === 'failed'
      ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0"><AlertTriangle size={10} className="me-0.5" />{t('recsPage.failed')}</Badge>
      : <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200"><Sparkles size={10} className="me-0.5" />{t('sourcesPage.analyzed')}</Badge>;

  // Linked entities
  const linkedPoiIds = rec.linkedEntities.filter(e => e.entity_type === 'poi').map(e => e.entity_id);
  const linkedTransportIds = rec.linkedEntities.filter(e => e.entity_type === 'transportation').map(e => e.entity_id);
  const linkedContactIds = rec.linkedEntities.filter(e => e.entity_type === 'contact').map(e => e.entity_id);
  const linkedPois = pois.filter(p => linkedPoiIds.includes(p.id));
  const linkedTransport = transportation.filter(tr => linkedTransportIds.includes(tr.id));
  const linkedContacts = contacts.filter(c => linkedContactIds.includes(c.id));
  const hasLinkedEntities = linkedPois.length > 0 || linkedTransport.length > 0 || linkedContacts.length > 0;
  const placesCount = linkedPois.length + linkedTransport.length;
  const isExpanded = expandedId === rec.id;

  const thumbnail = rec.sourceImage || null;

  // Map placeholder for maps recommendations
  const isMapRec = !!(rec.analysis as Record<string, unknown>)?.map_list_id
    || (rec.sourceUrl && /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/i.test(rec.sourceUrl));

  return (
    <div className={`group rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow ${rec.status === 'processing' ? 'opacity-80' : ''} ${rec.status === 'failed' ? 'border-destructive/30' : ''}`}>
      {/* Thumbnail / video player / static map */}
      {playing && youtubeId ? (
        <div className="relative w-full aspect-video bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media" allowFullScreen title={rec.sourceTitle || ''}
          />
          <button onClick={() => setPlaying(false)}
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
            <X size={14} />
          </button>
        </div>
      ) : isMapRec ? (
        <MapPlaceholder />
      ) : isVideo && thumbnail ? (
        <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer" className="block"
          onClick={(e) => { if (youtubeId) { e.preventDefault(); setPlaying(true); } }}>
          <div className="relative w-full aspect-video bg-muted overflow-hidden">
            <img src={thumbnail} alt={rec.sourceTitle || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            {youtubeId && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-red-600/90 rounded-full p-3"><Youtube size={24} className="text-white" /></div>
              </div>
            )}
          </div>
        </a>
      ) : thumbnail ? (
        <div className="w-full h-40 overflow-hidden">
          <img src={thumbnail} alt={rec.sourceTitle || ''} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      ) : null}

      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2">
              {rec.sourceTitle || rec.analysis?.main_site || rec.sourceUrl || t('recsPage.title')}
            </h3>
            {hasLinkedEntities && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {placesCount > 0 && t('recsPage.placesAdded', { count: placesCount })}
                {placesCount > 0 && linkedContacts.length > 0 && ', '}
                {linkedContacts.length > 0 && t('recsPage.contactsAdded', { count: linkedContacts.length })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {statusBadge}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical size={14} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {rec.sourceUrl && !rec.sourceUrl.startsWith('text://') && rec.status !== 'processing' && (
                  <DropdownMenuItem onClick={() => onResend(rec)} disabled={syncing[rec.id]}>
                    <RotateCw size={14} className="me-2" />{t('recsPage.resend')}
                  </DropdownMenuItem>
                )}
                {rec.analysis?.map_list_id && (
                  <DropdownMenuItem onClick={() => onRefreshMapList(rec)} disabled={syncing[rec.id]}>
                    <RefreshCw size={14} className="me-2" />{t('recsPage.refreshList')}
                  </DropdownMenuItem>
                )}
                {rec.analysis?.source_text && (
                  <DropdownMenuItem onClick={() => setSourceTextDialog({ title: rec.sourceTitle || t('recsPage.viewSourceText'), text: rec.analysis.source_text! })}>
                    <FileText size={14} className="me-2" />{t('recsPage.viewSourceText')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDelete(rec.id)} className="text-destructive">
                  <Trash2 size={14} className="me-2" />{t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {rec.sourceUrl && !rec.sourceUrl.startsWith('text://') && (
            <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 text-[10px]">
              <ExternalLink size={10} />{new URL(rec.sourceUrl).hostname.replace('www.', '')}
            </a>
          )}
        </div>

        {/* Error message for failed */}
        {rec.status === 'failed' && rec.error && (
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{rec.error}</p>
        )}

        {/* Extracted items preview (from AI analysis) */}
        {rec.analysis?.extracted_items && rec.analysis.extracted_items.length > 0 && (
          <div className="space-y-1">
            {rec.analysis.extracted_items.slice(0, isExpanded ? undefined : 3).map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs p-1 rounded bg-muted/50">
                {item.sentiment === 'good' && <ThumbsUp size={10} className="text-primary shrink-0" />}
                {item.sentiment === 'bad' && <ThumbsDown size={10} className="text-destructive shrink-0" />}
                <SubCategoryIcon type={item.category} size={10} />
                <span className="truncate">{item.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Linked entities — expandable */}
        {hasLinkedEntities && (
          <button
            className="flex items-center gap-1 text-xs text-primary hover:underline w-full"
            onClick={() => setExpandedId(isExpanded ? null : rec.id)}
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {t('recsPage.details')} ({placesCount + linkedContacts.length})
          </button>
        )}

        {hasLinkedEntities && isExpanded && (
          <div className="pt-2 border-t space-y-1">
            {linkedPois.map(poi => (
              <button key={poi.id}
                className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10 w-full text-left hover:bg-primary/10 transition-colors text-xs"
                onClick={() => setSelectedPoi(poi)}>
                <SubCategoryIcon type={poi.placeType || poi.activityType || poi.category} size={12} />
                <span className="font-medium truncate flex-1">{poi.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{poi.status}</Badge>
              </button>
            ))}
            {linkedTransport.map(tr => (
              <div key={tr.id} className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10 text-xs">
                <SubCategoryIcon type={tr.category} size={12} />
                <span className="font-medium capitalize truncate flex-1">{tr.category}</span>
                {tr.segments.length > 0 && (
                  <span className="text-muted-foreground">{tr.segments[0].from.name} → {tr.segments[tr.segments.length - 1].to.name}</span>
                )}
                <Badge variant="outline" className="text-[10px] shrink-0">{tr.status}</Badge>
              </div>
            ))}
            {linkedContacts.map(c => (
              <button key={c.id}
                className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10 w-full text-left hover:bg-primary/10 transition-colors text-xs"
                onClick={() => setSelectedContact(c)}>
                <Users size={12} className="text-teal-500 shrink-0" />
                <span className="font-medium truncate flex-1">{c.name}</span>
                <span className="text-muted-foreground capitalize">({t(`contactRole.${c.role}`, c.role)})</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──

function SkeletonCards() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-lg border bg-card overflow-hidden">
          <Skeleton className="w-full aspect-video" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-24" /></div>
          </div>
        </div>
      ))}
    </>
  );
}

// ── Main page ──

const Sources = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();
  const { transportation } = useTransport();
  const { contacts, updateContact, deleteContact } = useContacts();
  const { language } = useLanguage();
  const { toast } = useToast();
  const lang = language as ResourceLang;
  const tripId = activeTrip?.id;
  const countries = activeTrip?.countries || [];

  // State
  const [resources, setResources] = useState<CountryResource[]>([]);
  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchingCountries, setSearchingCountries] = useState<Set<string>>(new Set());
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [analyzingUrls, setAnalyzingUrls] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [selectedPoi, setSelectedPoi] = useState<PointOfInterest | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [sourceTextDialog, setSourceTextDialog] = useState<{ title: string; text: string } | null>(null);

  // Webhook token
  useEffect(() => {
    supabase.from('webhook_tokens').select('token').single()
      .then(({ data }) => setWebhookToken(data?.token ?? null));
  }, []);

  // Load recommendations + real-time
  useEffect(() => {
    if (!tripId) return;
    fetchTripRecommendations(tripId).then(setRecommendations).catch(console.error);
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`sources-rt-${tripId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'source_recommendations',
        filter: `trip_id=eq.${tripId}`,
      }, () => {
        fetchTripRecommendations(tripId).then(setRecommendations).catch(console.error);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  // Load S3 resources
  const doSearch = async (country: string) => {
    try {
      const newResources = await triggerResourceSearch(country, lang);
      if (newResources.length > 0) {
        setResources(prev => mergeResources(prev, newResources));
      }
    } catch (err: unknown) {
      console.error(`[sources] Search failed for ${country}:`, err);
    } finally {
      setSearchingCountries(prev => { const next = new Set(prev); next.delete(country); return next; });
    }
  };

  const loadResources = useCallback(async () => {
    if (countries.length === 0) { setLoading(false); return; }
    setLoading(true);
    const allResources: CountryResource[] = [];
    const toSearch: string[] = [];

    const results = await Promise.all(
      countries.map(async (country) => {
        const file = await loadCountryResources(country);
        return { country, file };
      })
    );
    for (const { country, file } of results) {
      if (file) allResources.push(...file.resources);
      if (needsLangSearch(file, lang)) toSearch.push(country);
    }

    // Deduplicate
    const seen = new Set<string>();
    const deduped = allResources.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
    setResources(deduped);
    setLoading(false);

    if (toSearch.length > 0) {
      setSearchingCountries(new Set(toSearch));
      for (const country of toSearch) doSearch(country);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries.join(','), lang]);

  useEffect(() => { loadResources(); }, [loadResources]);

  // Recommendation URL set (for "analyzed" flag on resources)
  const analyzedUrls = useMemo(() => new Set(
    recommendations.map(r => r.sourceUrl).filter(Boolean) as string[]
  ), [recommendations]);

  // Build unified list
  const unifiedSources = useMemo((): UnifiedSource[] => {
    const recUrls = new Set(recommendations.map(r => r.sourceUrl).filter(Boolean));
    const fromResources: UnifiedSource[] = resources
      .filter(r => !recUrls.has(r.url)) // dedup: skip resources that have a recommendation
      .map(r => ({ kind: 'resource' as const, data: r }));
    const fromRecs: UnifiedSource[] = recommendations
      .map(r => ({ kind: 'recommendation' as const, data: r }));
    // Recommendations first, then resources
    return [...fromRecs, ...fromResources];
  }, [resources, recommendations]);

  // Group by section
  const sectionSources = useMemo(() => {
    const groups: Record<SourceSection, UnifiedSource[]> = { videos: [], maps: [], articles: [], conversations: [] };
    for (const s of unifiedSources) groups[getSourceSection(s)].push(s);
    // Sort resources by language priority within each section
    const langPriority = (r: CountryResource) => {
      if (r.search_language === lang) return 0;
      if (r.search_language === 'he') return 1;
      return 2;
    };
    for (const key of Object.keys(groups) as SourceSection[]) {
      groups[key].sort((a, b) => {
        if (a.kind === 'resource' && b.kind === 'resource') return langPriority(a.data) - langPriority(b.data);
        return 0;
      });
    }
    return groups;
  }, [unifiedSources, lang]);

  // ── Handlers ──

  const handleAnalyze = async (url: string) => {
    if (!webhookToken || !tripId || analyzedUrls.has(url)) return;
    setAnalyzingUrls(prev => new Set(prev).add(url));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, webhook_token: webhookToken }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.status === 202) {
        const jobId = data.job_id;
        const meta = data.source_metadata || {};
        if (jobId) {
          await supabase.from('source_recommendations').insert([{
            recommendation_id: jobId, trip_id: tripId, source_url: url,
            source_title: meta.title || null, source_image: meta.image || null,
            status: 'processing', analysis: {}, linked_entities: [],
          }]);
        }
        toast({ title: t('sourcesPage.analyzeStarted') });
      } else if (res.status === 200) {
        toast({ title: t('urlSubmit.alreadyAnalyzed') });
      } else {
        toast({ title: data.error || t('common.somethingWentWrong'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('urlSubmit.serverError'), variant: 'destructive' });
    } finally {
      setAnalyzingUrls(prev => { const next = new Set(prev); next.delete(url); return next; });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecommendation(id);
      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast({ title: t('recsPage.recDeleted') });
    } catch {
      toast({ title: t('recsPage.deleteError'), variant: 'destructive' });
    }
  };

  const handleResend = async (rec: SourceRecommendation) => {
    if (!rec.sourceUrl || !tripId) return;
    setSyncing(prev => ({ ...prev, [rec.id]: true }));
    try {
      const token = webhookToken || (await supabase.from('webhook_tokens').select('token').single()).data?.token;
      if (!token) throw new Error('No webhook token');
      await deleteRecommendation(rec.id);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rec.sourceUrl, webhook_token: token, overwrite: true }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.status === 202) {
        const jobId = data.job_id;
        const meta = data.source_metadata || {};
        await supabase.from('source_recommendations').insert([{
          recommendation_id: jobId, trip_id: tripId, source_url: rec.sourceUrl,
          source_title: meta.title || rec.sourceTitle || null,
          source_image: meta.image || rec.sourceImage || null,
          status: 'processing', analysis: {}, linked_entities: [],
        }]);
        toast({ title: t('recsPage.resent') });
      } else {
        toast({ title: t('recsPage.resendFailed'), variant: 'destructive' });
      }
      fetchTripRecommendations(tripId).then(setRecommendations).catch(console.error);
    } catch (err: unknown) {
      toast({ title: t('recsPage.resendFailed'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
    setSyncing(prev => ({ ...prev, [rec.id]: false }));
  };

  const handleRefreshMapList = async (rec: SourceRecommendation) => {
    const listId = (rec.analysis as Record<string, unknown>)?.map_list_id as string | undefined;
    if (!listId) return;
    setSyncing(prev => ({ ...prev, [rec.id]: true }));
    try {
      const token = webhookToken || (await supabase.from('webhook_tokens').select('token').single()).data?.token;
      if (!token) throw new Error('No webhook token');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-maps-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: listId, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      toast({
        title: t('recsPage.synced', { name: rec.sourceTitle }),
        description: data.new_places > 0 ? t('recsPage.newPlacesFound', { count: data.new_places }) : t('recsPage.noNewPlaces'),
      });
    } catch (e: unknown) {
      toast({ title: t('recsPage.syncFailed'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
    setSyncing(prev => ({ ...prev, [rec.id]: false }));
  };

  const handleRefreshResources = async () => {
    for (const country of countries) invalidateResourceCache(country);
    setSearchingCountries(new Set(countries));
    setResources([]);
    for (const country of countries) doSearch(country);
  };

  // ── Render ──

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  if (loading && resources.length === 0 && recommendations.length === 0) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"><SkeletonCards /></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('sourcesPage.title')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('sourcesPage.subtitle')}
              {searchingCountries.size > 0 && (
                <span className="inline-flex items-center gap-1 ms-2 text-primary">
                  <Loader2 size={12} className="animate-spin" />{t('resourcesPage.updating')}
                </span>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefreshResources} disabled={searchingCountries.size > 0}>
            <RefreshCw size={16} className={searchingCountries.size > 0 ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Sections */}
        {unifiedSources.length === 0 && searchingCountries.size === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Globe size={48} className="mx-auto mb-4 opacity-30" />
            <p>{t('sourcesPage.noSources')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {SECTIONS.map(section => {
              const items = sectionSources[section.key];
              if (items.length === 0) return null;
              return (
                <div key={section.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <section.icon size={18} className={section.iconColor} />
                    <h3 className="font-semibold text-sm">{t(section.labelKey)}</h3>
                    <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                  </div>
                  <div className="w-full overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' as never }}>
                    <div className="flex gap-4 pb-3" style={{ minWidth: 'max-content' }}>
                      {items.map((source, i) => {
                        const url = getSourceUrl(source);
                        return (
                          <div key={`${section.key}-${url || i}`} className="shrink-0 w-[280px] sm:w-[320px]">
                            {source.kind === 'resource' ? (
                              <ResourceCardContent
                                resource={source.data}
                                analyzed={analyzedUrls.has(url)}
                                onAnalyze={webhookToken ? handleAnalyze : undefined}
                                analyzing={analyzingUrls.has(url)}
                              />
                            ) : (
                              <RecommendationCardContent
                                rec={source.data}
                                pois={pois}
                                transportation={transportation}
                                contacts={contacts}
                                expandedId={expandedId}
                                setExpandedId={setExpandedId}
                                onDelete={handleDelete}
                                onResend={handleResend}
                                onRefreshMapList={handleRefreshMapList}
                                syncing={syncing}
                                setSourceTextDialog={setSourceTextDialog}
                                setSelectedPoi={setSelectedPoi}
                                setSelectedContact={setSelectedContact}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {searchingCountries.size > 0 && resources.length === 0 && (
              <div className="flex gap-4">
                <div className="shrink-0 w-[280px]"><SkeletonCards /></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* POI Detail Dialog */}
      {selectedPoi && (
        <POIDetailDialog
          poi={selectedPoi}
          open={!!selectedPoi}
          onOpenChange={(open) => { if (!open) setSelectedPoi(null); }}
        />
      )}

      {/* Contact Edit Dialog */}
      <ContactEditDialog
        contact={selectedContact}
        open={!!selectedContact}
        onOpenChange={(open: boolean) => { if (!open) setSelectedContact(null); }}
        onSave={async (data) => {
          if (selectedContact) { await updateContact(selectedContact.id, data); setSelectedContact(null); }
        }}
        onDelete={async (id) => { await deleteContact(id); setSelectedContact(null); }}
      />

      {/* Source Text Dialog */}
      <Dialog open={!!sourceTextDialog} onOpenChange={(open) => { if (!open) setSourceTextDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText size={16} />{sourceTextDialog?.title}
            </DialogTitle>
          </DialogHeader>
          <pre className="flex-1 overflow-y-auto p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">{sourceTextDialog?.text}</pre>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Sources;
