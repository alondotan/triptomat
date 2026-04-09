import { useState, useMemo, useEffect } from 'react';
import { useLocalizeLocation } from '@/features/geodata/useLocationDescriptions';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import type { PointOfInterest } from '@/types/trip';
import type { SourceRecommendation } from '@/types/webhook';
import { fetchTripRecommendations } from '@/features/inbox/recommendationService';

// ─── types ──────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'attraction' | 'eatery' | 'accommodation' | 'event' | 'service';
type ViewMode = 'by-type' | 'by-location';

// ─── helpers ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  attraction:    'Attraction',
  service:       'Service',
  eatery:        'Restaurant',
  accommodation: 'Hotel',
  event:         'Event',
};

// Gradient placeholders when no image is available
const CATEGORY_GRADIENTS: Record<string, string> = {
  attraction:    'from-slate-900 via-blue-950 to-indigo-900',
  service:       'from-slate-900 via-zinc-900 to-slate-800',
  eatery:        'from-amber-950 via-orange-950 to-red-950',
  accommodation: 'from-emerald-950 via-teal-950 to-cyan-950',
  event:         'from-purple-950 via-violet-950 to-indigo-950',
};

// ─── sub-components ─────────────────────────────────────────────────────────

function POICard({ poi, localizeLocation }: { poi: PointOfInterest; localizeLocation: (n: string | null | undefined) => string }) {
  const gradient = CATEGORY_GRADIENTS[poi.category] ?? 'from-slate-900 to-slate-800';
  const city = localizeLocation(poi.location.city || poi.location.country);

  return (
    <div className="min-w-[280px] md:min-w-[340px] snap-start">
      <div className="group relative rounded-3xl overflow-hidden bg-v2-surface-container-high transition-all duration-500 hover:-translate-y-2 aspect-[4/5]">
        {/* Image or gradient */}
        {poi.imageUrl ? (
          <img
            src={poi.imageUrl}
            alt={poi.name}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Category badge */}
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="bg-black/40 backdrop-blur-md text-v2-primary px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-v2-primary/20">
            {CATEGORY_LABELS[poi.category] ?? poi.category}
          </span>
        </div>

        {/* Status badge */}
        {poi.status === 'suggested' && (
          <div className="absolute top-4 right-4">
            <span className="bg-v2-secondary/20 backdrop-blur-md text-v2-secondary px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border border-v2-secondary/20">
              Suggested
            </span>
          </div>
        )}

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h4 className="text-lg font-bold text-white leading-tight mb-1 line-clamp-2">
            {poi.name}
          </h4>
          {city && (
            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <span className="material-symbols-outlined text-xs" style={{ fontSize: 14 }}>location_on</span>
              <span className="font-medium">{city}</span>
            </div>
          )}
          {poi.details?.notes?.user_summary && (
            <p className="text-white/50 text-xs mt-2 line-clamp-2 leading-relaxed">
              {poi.details.notes.user_summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceCard({ rec }: { rec: SourceRecommendation }) {
  const count = rec.analysis?.extracted_items?.length ?? 0;
  return (
    <div className="min-w-[280px] md:min-w-[320px] snap-start">
      <div className="group relative rounded-3xl overflow-hidden bg-v2-surface-container-high transition-all duration-500 hover:-translate-y-2 aspect-[4/5]">
        {rec.sourceImage ? (
          <img src={rec.sourceImage} alt={rec.sourceTitle ?? ''} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute top-4 left-4">
          <span className="bg-black/40 backdrop-blur-md text-v2-tertiary px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-v2-tertiary/20">
            Source
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h4 className="text-base font-bold text-white leading-tight mb-1 line-clamp-2">
            {rec.sourceTitle ?? 'Untitled source'}
          </h4>
          {count > 0 && (
            <p className="text-white/50 text-xs font-medium">{count} place{count !== 1 ? 's' : ''} found</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCarousel({
  title,
  subtitle,
  accentColor = 'bg-v2-secondary',
  seeAllHref,
  children,
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
  seeAllHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6 border-b border-v2-outline-variant/10 pb-4 px-4 md:px-0">
        <div className="flex items-center gap-4">
          <div className={`w-2 h-8 ${accentColor} rounded-full`} />
          <div>
            <h3 className="text-2xl font-black tracking-tight text-v2-on-surface font-plus-jakarta">{title}</h3>
            {subtitle && (
              <p className="text-v2-on-surface-variant text-xs uppercase tracking-widest font-bold mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {seeAllHref && (
          <a
            href={seeAllHref}
            className="text-v2-secondary hover:underline text-xs font-bold uppercase tracking-widest flex items-center gap-1 flex-shrink-0"
          >
            See all
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </a>
        )}
      </div>

      {/* Carousel */}
      <div className="flex gap-5 overflow-x-auto v2-hide-scrollbar snap-x snap-mandatory pb-4 px-4 md:px-0">
        {children}
      </div>
    </section>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: 'all',           label: 'All',         icon: 'auto_awesome' },
  { key: 'attraction',    label: 'Attractions',  icon: 'attractions' },
  { key: 'eatery',        label: 'Dining',       icon: 'restaurant' },
  { key: 'accommodation', label: 'Hotels',       icon: 'hotel' },
  { key: 'event',         label: 'Events',       icon: 'event' },
  { key: 'service',       label: 'Services',     icon: 'design_services' },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'by-type',     label: 'By Type',     icon: 'category' },
  { key: 'by-location', label: 'By Location', icon: 'location_city' },
];

const ACCENT_COLORS: Record<string, string> = {
  attraction:    'bg-v2-primary',
  eatery:        'bg-v2-secondary',
  accommodation: 'bg-v2-tertiary',
  event:         'bg-v2-primary-container',
  service:       'bg-v2-secondary-container',
};

export default function RecommendationsV2() {
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();
  const localizeLocation = useLocalizeLocation();


  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('by-type');
  const [recs, setRecs] = useState<SourceRecommendation[]>([]);

  // Fetch source recommendations
  useEffect(() => {
    if (!activeTrip?.id) return;
    fetchTripRecommendations(activeTrip.id).then(setRecs).catch(() => {});
  }, [activeTrip?.id]);

  // Filter pois
  const filteredPOIs = useMemo(() => {
    if (activeFilter === 'all') return pois;
    return pois.filter(p => p.category === activeFilter);
  }, [pois, activeFilter]);

  // Group by category
  const byCategory = useMemo(() => {
    const map: Record<string, PointOfInterest[]> = {};
    filteredPOIs.forEach(p => {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return map;
  }, [filteredPOIs]);

  // Group by city/location (translated key for display)
  const byLocation = useMemo(() => {
    const map: Record<string, PointOfInterest[]> = {};
    filteredPOIs.forEach(p => {
      const key = localizeLocation(p.location.city || p.location.country) || 'Other';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [filteredPOIs, localizeLocation]);

  const totalPOIs = filteredPOIs.length;
  const totalRecs = recs.length;

  if (!activeTrip) {
    return (
      <div className="min-h-screen bg-v2-background flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-v2-on-surface-variant mb-4 block">explore_off</span>
          <p className="text-v2-on-surface-variant font-plus-jakarta">No trip selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v2-background text-v2-on-surface font-plus-jakarta">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* ── Page header ── */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-v2-secondary font-bold mb-2 block">
              Curation Engine
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-v2-on-surface leading-none">
              Curated{' '}
              <span className="text-v2-primary italic">Waypoints</span>
            </h1>
            <p className="text-v2-on-surface-variant text-sm mt-3 font-medium">
              {totalPOIs} places · {totalRecs} sources · {activeTrip.name}
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-v2-surface-container rounded-2xl p-1 self-start">
            {VIEW_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setViewMode(m.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  viewMode === m.key
                    ? 'bg-v2-surface-container-lowest text-v2-on-surface shadow-sm'
                    : 'text-v2-on-surface-variant hover:text-v2-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
                <span className="hidden sm:block">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Filter chips ── */}
        <div className="flex gap-2 overflow-x-auto v2-hide-scrollbar pb-2 mb-10">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-all flex-shrink-0 ${
                activeFilter === tab.key
                  ? 'bg-v2-primary text-v2-on-primary shadow-lg'
                  : 'bg-v2-surface-container-high text-v2-on-surface-variant hover:bg-v2-surface-container-highest hover:text-v2-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Empty state ── */}
        {totalPOIs === 0 && totalRecs === 0 && (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-6xl text-v2-on-surface-variant/30 mb-4 block">travel_explore</span>
            <h3 className="text-xl font-bold text-v2-on-surface mb-2">No places yet</h3>
            <p className="text-v2-on-surface-variant text-sm max-w-xs mx-auto">
              Start a chat on the Home page and ask for recommendations to populate this section.
            </p>
          </div>
        )}

        {/* ── BY TYPE view ── */}
        {viewMode === 'by-type' && (
          <>
            {Object.entries(byCategory).map(([category, items]) => (
              <SectionCarousel
                key={category}
                title={CATEGORY_LABELS[category] ?? category}
                subtitle={`${items.length} place${items.length !== 1 ? 's' : ''}`}
                accentColor={ACCENT_COLORS[category] ?? 'bg-v2-primary'}
                seeAllHref={
                  (category === 'attraction' || category === 'service')
                    ? `/v2/attractions?category=${category}`
                    : category === 'eatery'
                      ? '/v2/eateries'
                      : category === 'accommodation'
                        ? '/v2/accommodation'
                        : category === 'event'
                          ? '/v2/events'
                          : undefined
                }
              >
                {items.map(poi => <POICard key={poi.id} poi={poi} localizeLocation={localizeLocation} />)}
              </SectionCarousel>
            ))}

            {/* Sources section */}
            {recs.length > 0 && (
              <SectionCarousel
                title="Sources"
                subtitle={`${recs.length} source${recs.length !== 1 ? 's' : ''}`}
                accentColor="bg-v2-tertiary"
              >
                {recs.map(rec => <SourceCard key={rec.id} rec={rec} />)}
              </SectionCarousel>
            )}
          </>
        )}

        {/* ── BY LOCATION view ── */}
        {viewMode === 'by-location' && (
          <>
            {Object.entries(byLocation).map(([city, items], i) => (
              <SectionCarousel
                key={city}
                title={city}
                subtitle={`${items.length} destination${items.length !== 1 ? 's' : ''}`}
                accentColor={i % 2 === 0 ? 'bg-v2-secondary' : 'bg-v2-primary'}
              >
                {items.map(poi => <POICard key={poi.id} poi={poi} localizeLocation={localizeLocation} />)}
              </SectionCarousel>
            ))}

            {/* Sources section at bottom */}
            {recs.length > 0 && (
              <SectionCarousel
                title="Research Sources"
                subtitle={`${recs.length} link${recs.length !== 1 ? 's' : ''}`}
                accentColor="bg-v2-tertiary"
              >
                {recs.map(rec => <SourceCard key={rec.id} rec={rec} />)}
              </SectionCarousel>
            )}
          </>
        )}

      </div>
    </div>
  );
}
