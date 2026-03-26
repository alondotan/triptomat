import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Hotel, Plane, Users, Compass, Phone, Mail, Train, Bus, Ship, Car, ChevronLeft, ChevronRight, Utensils, Calendar, Play, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { usePOI } from '@/features/poi/POIContext';
import { useTransport } from '@/features/transport/TransportContext';
import { useContacts } from '@/features/itinerary/ItineraryContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { POICard } from '@/features/poi/POICard';
import { FeedSection } from './FeedSection';
import { Badge } from '@/components/ui/badge';
import { fetchTripRecommendations } from '@/features/inbox/recommendationService';
import { loadCountryResources, type CountryResource } from '@/features/geodata/resourceService';
import type { SourceRecommendation } from '@/types/webhook';
import { format, parseISO } from 'date-fns';

const PREVIEW_LIMIT = 5;
const CAROUSEL_LIMIT = 15;

const transportIconMap: Record<string, React.ReactNode> = {
  airplane: <Plane size={16} />,
  domesticFlight: <Plane size={16} />,
  internationalFlight: <Plane size={16} />,
  train: <Train size={16} />,
  nightTrain: <Train size={16} />,
  highSpeedTrain: <Train size={16} />,
  bus: <Bus size={16} />,
  ferry: <Ship size={16} />,
  cruise: <Ship size={16} />,
  taxi: <Car size={16} />,
  carRental: <Car size={16} />,
};

function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, HH:mm');
  } catch {
    return iso;
  }
}

/** Horizontal scroll carousel with arrow buttons */
function HorizontalCarousel({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    return () => el?.removeEventListener('scroll', checkScroll);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 shadow border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 shadow border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

/** Extract YouTube video ID from various URL formats */
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

function ResourceCard({ res, wide = false }: { res: CountryResource; wide?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const isVideo = res.source_type === 'youtube' || res.source_type === 'tiktok';
  const youtubeId = res.source_type === 'youtube' ? getYouTubeId(res.url) : null;
  const canEmbed = !!youtubeId;

  const handleClick = (e: React.MouseEvent) => {
    if (canEmbed) {
      e.preventDefault();
      setPlaying(true);
    }
  };

  const cardWidth = wide ? 'w-[220px]' : 'w-[160px]';

  return (
    <div className={`shrink-0 ${cardWidth}`}>
      {playing && youtubeId ? (
        /* Inline YouTube embed */
        <div className="space-y-1.5">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title={res.title}
            />
          </div>
          <p className="text-xs font-medium line-clamp-2 leading-tight">{res.title}</p>
          {res.channel && (
            <p className="text-[10px] text-muted-foreground truncate">{res.channel}</p>
          )}
        </div>
      ) : (
        /* Thumbnail card */
        <a
          href={res.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group/card"
          onClick={handleClick}
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
            {res.thumbnail ? (
              <img src={res.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Compass size={24} className="text-muted-foreground/40" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/30 transition-colors flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                {isVideo
                  ? <Play size={14} className="text-white ms-0.5" fill="white" />
                  : <ExternalLinkIcon size={14} className="text-white" />
                }
              </div>
            </div>
            <Badge className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0 h-4 bg-black/50 text-white border-0 backdrop-blur-sm">
              {res.source_type}
            </Badge>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-xs font-medium line-clamp-2 leading-tight">{res.title}</p>
            {res.channel && (
              <p className="text-[10px] text-muted-foreground truncate">{res.channel}</p>
            )}
          </div>
        </a>
      )}
    </div>
  );
}

export function OverviewFeed() {
  const { t } = useTranslation();
  const { pois } = usePOI();
  const { transportation } = useTransport();
  const { contacts } = useContacts();
  const { activeTrip } = useActiveTrip();

  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [resources, setResources] = useState<CountryResource[]>([]);

  // Fetch recommendations
  useEffect(() => {
    if (!activeTrip?.id) return;
    fetchTripRecommendations(activeTrip.id).then(setRecommendations).catch(() => {});
  }, [activeTrip?.id]);

  // Fetch resources for trip countries
  useEffect(() => {
    if (!activeTrip?.countries?.length) return;
    Promise.all(activeTrip.countries.map(c => loadCountryResources(c)))
      .then(results => {
        const all = results.flatMap(r => r?.resources ?? []);
        setResources(all);
      })
      .catch(() => {});
  }, [activeTrip?.countries]);

  // Split attractions: eateries vs rest
  const allAttractions = useMemo(() =>
    pois.filter(p => p.category === 'attraction' || p.category === 'service'),
    [pois]);

  const allEvents = useMemo(() =>
    pois.filter(p => p.category === 'event'),
    [pois]);

  const eventsCarousel = useMemo(() =>
    allEvents.slice(0, CAROUSEL_LIMIT),
    [allEvents]);

  const allEateries = useMemo(() =>
    pois.filter(p => p.category === 'eatery'),
    [pois]);

  const attractionsCarousel = useMemo(() =>
    allAttractions.slice(0, CAROUSEL_LIMIT),
    [allAttractions]);

  const eateriesCarousel = useMemo(() =>
    allEateries.slice(0, CAROUSEL_LIMIT),
    [allEateries]);

  const allHotels = useMemo(() =>
    pois.filter(p => p.category === 'accommodation'),
    [pois]);

  const hotelsCarousel = useMemo(() =>
    allHotels.slice(0, CAROUSEL_LIMIT),
    [allHotels]);

  const transportCarousel = useMemo(() =>
    transportation.slice(0, CAROUSEL_LIMIT),
    [transportation]);

  const contactsCarousel = useMemo(() =>
    contacts.slice(0, CAROUSEL_LIMIT),
    [contacts]);

  const recsPreview = recommendations.slice(0, PREVIEW_LIMIT);
  const resourcesCarousel = resources.slice(0, CAROUSEL_LIMIT);

  return (
    <div className="space-y-3 pb-3">
        {/* Attractions (non-eatery) — horizontal carousel */}
        <FeedSection
          title={t('overview.attractions')}
          icon={MapPin}
          count={allAttractions.length}
          linkTo="/attractions"
          iconColor="text-blue-500"
        >
          {attractionsCarousel.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {attractionsCarousel.map(poi => (
                <div key={poi.id} className="shrink-0 w-[130px]">
                  <POICard poi={poi} level={3} />
                </div>
              ))}
            </HorizontalCarousel>
          )}
        </FeedSection>

        {/* Events — horizontal carousel */}
        <FeedSection
          title={t('overview.events')}
          icon={Calendar}
          count={allEvents.length}
          linkTo="/events"
          iconColor="text-purple-500"
        >
          {eventsCarousel.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {eventsCarousel.map(poi => (
                <div key={poi.id} className="shrink-0 w-[130px]">
                  <POICard poi={poi} level={3} />
                </div>
              ))}
            </HorizontalCarousel>
          )}
        </FeedSection>

        {/* Eateries — horizontal carousel */}
        <FeedSection
          title={t('overview.eateries')}
          icon={Utensils}
          count={allEateries.length}
          linkTo="/eateries"
          iconColor="text-orange-500"
        >
          {eateriesCarousel.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {eateriesCarousel.map(poi => (
                <div key={poi.id} className="shrink-0 w-[130px]">
                  <POICard poi={poi} level={3} />
                </div>
              ))}
            </HorizontalCarousel>
          )}
        </FeedSection>

        {/* Hotels — horizontal carousel */}
        <FeedSection
          title={t('overview.hotels')}
          icon={Hotel}
          count={allHotels.length}
          linkTo="/accommodation"
          iconColor="text-indigo-500"
        >
          {hotelsCarousel.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {hotelsCarousel.map(poi => (
                <div key={poi.id} className="shrink-0 w-[130px]">
                  <POICard poi={poi} level={3} />
                </div>
              ))}
            </HorizontalCarousel>
          )}
        </FeedSection>

        {/* Transport — horizontal carousel (wider cards) */}
        <FeedSection
          title={t('overview.transport')}
          icon={Plane}
          count={transportation.length}
          linkTo="/transport"
          iconColor="text-cyan-500"
        >
          {transportCarousel.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {transportCarousel.map(tr => {
                const firstSeg = tr.segments[0];
                const icon = transportIconMap[tr.category] ?? <Car size={16} />;
                return (
                  <div key={tr.id} className="shrink-0 w-[200px]">
                    <div className="rounded-lg border bg-card p-4 h-full space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-primary">{icon}</span>
                        <Badge variant="outline" className="text-[10px]">{t(`status.${tr.status}`)}</Badge>
                      </div>
                      {firstSeg && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                            <p className="text-sm font-medium truncate">{firstSeg.from.name}</p>
                          </div>
                          <div className="ms-1 border-s border-dashed border-muted-foreground/40 h-3" />
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground shrink-0" />
                            <p className="text-sm font-medium truncate">{firstSeg.to.name}</p>
                          </div>
                        </div>
                      )}
                      {firstSeg?.departure_time && (
                        <p className="text-xs text-muted-foreground">{formatDateTime(firstSeg.departure_time)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </HorizontalCarousel>
          )}
        </FeedSection>

        {/* Sources — merged resources + recommendations carousel */}
        <FeedSection
          title={t('overview.resources')}
          icon={Compass}
          count={resources.length + recommendations.length}
          linkTo="/sources"
          iconColor="text-emerald-500"
        >
          {resourcesCarousel.length === 0 && recsPreview.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {recsPreview.map(rec => {
                // Check if maps rec → show static map thumbnail
                const isMapRec = !!(rec.analysis as Record<string, unknown>)?.map_list_id
                  || (rec.sourceUrl && /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/i.test(rec.sourceUrl));
                const thumbSrc = !isMapRec ? (rec.sourceImage || null) : null;
                return (
                  <div key={`rec-${rec.id}`} className="shrink-0 w-[220px]">
                    <div className="rounded-lg border bg-card overflow-hidden h-full">
                      {isMapRec ? (
                        <div className="w-full h-24 bg-[#f0f4f8] dark:bg-slate-800 overflow-hidden">
                          <img src="https://www.gstatic.com/mapspro/images/stock/20333-saved-702x336.png" alt="Google Maps"
                            className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      ) : thumbSrc ? (
                        <div className="w-full h-24 overflow-hidden bg-muted">
                          <img src={thumbSrc} alt={rec.sourceTitle || ''} className="w-full h-full object-cover"
                            loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      ) : null}
                      <div className="p-2">
                        <p className="text-xs font-medium line-clamp-2">{rec.sourceTitle || rec.sourceUrl || '—'}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant={rec.status === 'processing' ? 'outline' : 'secondary'} className="text-[10px]">
                            {rec.status === 'processing' ? t('recsPage.processing') : rec.analysis?.extracted_items?.length ? `${rec.analysis.extracted_items.length} ${t('overview.items')}` : rec.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {resourcesCarousel.map(res => (
                <ResourceCard key={res.id} res={res} wide />
              ))}
            </HorizontalCarousel>
          )}
        </FeedSection>

        {/* Contacts — horizontal carousel */}
        <FeedSection
          title={t('overview.contacts')}
          icon={Users}
          count={contacts.length}
          linkTo="/contacts"
          iconColor="text-teal-500"
        >
          {contactsCarousel.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('overview.noItems')}</p>
          ) : (
            <HorizontalCarousel>
              {contactsCarousel.map(c => (
                <div key={c.id} className="shrink-0 w-[130px]">
                  <div className="rounded-lg border bg-card p-3 h-full flex flex-col items-center gap-2 text-center">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users size={18} className="text-primary" />
                    </div>
                    <p className="text-xs font-medium truncate w-full">{c.name}</p>
                    <Badge variant="secondary" className="text-[10px]">{c.role}</Badge>
                    <div className="flex gap-2 mt-auto">
                      {c.phone && <Phone size={12} className="text-muted-foreground" />}
                      {c.email && <Mail size={12} className="text-muted-foreground" />}
                    </div>
                  </div>
                </div>
              ))}
            </HorizontalCarousel>
          )}
        </FeedSection>

    </div>
  );
}
