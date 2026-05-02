/**
 * V2 Attractions page — groups POIs by sub-category type (placeType/activityType)
 * and renders each group as a horizontal carousel with the new Midnight Cartographer design.
 *
 * The grouping/filtering logic is extracted from POIs.tsx (same behaviour).
 */
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalizeLocation } from '@/features/geodata/useLocationDescriptions';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import type { PointOfInterest, POICategory, POIStatus } from '@/types/trip';
import { V2POIForm } from '@/features/v2/forms/V2POIForm';
import {
  getSubCategoryGroup,
  getCategoryGroupLabel,
  getSubCategoryLabel,
} from '@/shared/lib/subCategoryConfig';
import { STATUS_COLORS, CATEGORY_GRADIENTS } from './v2Config';

// ─── config ──────────────────────────────────────────────────────────────────

const ALLOWED: POICategory[] = ['attraction', 'service'];

// ─── small POI card for carousels ────────────────────────────────────────────

function CarouselCard({ poi, onOpen }: { poi: PointOfInterest; onOpen: () => void }) {
  const localizeLocation = useLocalizeLocation();
  const gradient = CATEGORY_GRADIENTS[poi.category] ?? 'from-slate-900 to-slate-800';
  const city = localizeLocation(poi.location.city ?? poi.location.country);
  const typeLabel = poi.placeType
    ? getSubCategoryLabel(poi.placeType)
    : poi.activityType
      ? getSubCategoryLabel(poi.activityType)
      : null;

  return (
    <div
      className="min-w-[280px] lg:min-w-[320px] group cursor-pointer"
      onClick={onOpen}
    >
      {/* Image / gradient */}
      <div className="relative h-[220px] rounded-2xl overflow-hidden mb-3 bg-v2-surface-container-high shadow-xl transition-transform duration-500 group-hover:scale-[1.02]">
        {poi.imageUrl ? (
          <img
            src={poi.imageUrl}
            alt={poi.name}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Status badge */}
        <div className="absolute bottom-3 left-3">
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${STATUS_COLORS[poi.status] ?? ''}`}>
            {poi.status}
          </span>
        </div>
      </div>

      {/* Text below */}
      <h3 className="text-base font-bold text-v2-on-surface mb-0.5 line-clamp-1 font-plus-jakarta">
        {poi.name}
      </h3>
      <p className="text-v2-on-surface-variant text-xs flex items-center gap-1.5">
        {city && (
          <>
            <span className="material-symbols-outlined text-v2-secondary" style={{ fontSize: 12 }}>explore</span>
            <span className="uppercase tracking-widest font-bold">{city}</span>
            {typeLabel && <span className="text-v2-outline">·</span>}
          </>
        )}
        {typeLabel && <span>{typeLabel}</span>}
      </p>
    </div>
  );
}

// ─── carousel section ────────────────────────────────────────────────────────

function CategorySection({
  title,
  items,
  onOpenPOI,
}: {
  title: string;
  items: PointOfInterest[];
  onOpenPOI: (poi: PointOfInterest) => void;
}) {
  return (
    <section className="mb-14">
      {/* Section header */}
      <div className="flex justify-between items-end mb-5">
        <div>
          <h2 className="text-xl font-black tracking-tight text-v2-on-surface font-plus-jakarta">
            {title}
          </h2>
          <div className="h-0.5 w-6 bg-v2-secondary mt-1 rounded-full" />
        </div>
        <span className="text-v2-on-surface-variant text-xs font-bold uppercase tracking-wider">
          {items.length} place{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Horizontal carousel */}
      <div className="flex gap-5 overflow-x-auto v2-hide-scrollbar pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {items.map(poi => (
          <CarouselCard key={poi.id} poi={poi} onOpen={() => onOpenPOI(poi)} />
        ))}
      </div>
    </section>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTS: { key: POIStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'suggested', label: 'Suggested' },
  { key: 'planned',   label: 'Planned' },
  { key: 'booked',    label: 'Booked' },
  { key: 'visited',   label: 'Visited' },
];

export default function AttractionsV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();

  const [formPOI, setFormPOI] = useState<PointOfInterest | null | undefined>(undefined); // undefined = closed, null = create new
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<POIStatus | 'all'>('all');

  // Initial category filter from URL ?category=attraction
  const urlCategory = searchParams.get('category') as POICategory | null;
  const [categoryFilter, setCategoryFilter] = useState<POICategory | 'all'>(urlCategory ?? 'all');

  // Filter
  const filtered = useMemo(() => {
    let list = pois.filter(p => ALLOWED.includes(p.category));
    if (categoryFilter !== 'all') list = list.filter(p => p.category === categoryFilter);
    if (statusFilter !== 'all')   list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.location.city ?? '').toLowerCase().includes(q) ||
        (p.location.country ?? '').toLowerCase().includes(q) ||
        (p.placeType ?? '').toLowerCase().includes(q) ||
        (p.activityType ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [pois, categoryFilter, statusFilter, search]);

  // Group by sub-category (same logic as POIs.tsx groupBy=category)
  const SUB_GROUP_THRESHOLD = 5;
  const groups = useMemo(() => {
    // Build sub-map: sub-group key → POIs
    const subMap: Record<string, PointOfInterest[]> = {};
    for (const poi of filtered) {
      const raw = poi.placeType ?? poi.activityType;
      const groupKey = raw ? (getSubCategoryGroup(raw) ?? raw) : '—';
      if (!subMap[groupKey]) subMap[groupKey] = [];
      subMap[groupKey].push(poi);
    }

    // Split: groups with ≥ threshold get their own section; rest go to "General"
    const smallItems: PointOfInterest[] = [];
    const result: [string, PointOfInterest[]][] = [];

    for (const [key, items] of Object.entries(subMap)) {
      if (items.length >= SUB_GROUP_THRESHOLD) {
        result.push([key, items]);
      } else {
        smallItems.push(...items);
      }
    }
    if (smallItems.length > 0) result.push(['—', smallItems]);

    // Sort large sections alphabetically; "—" always last
    result.sort(([a], [b]) => {
      if (a === '—') return 1;
      if (b === '—') return -1;
      return a.localeCompare(b);
    });

    // Within each group: sort by name
    for (const [, items] of result) {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [filtered]);

  const getGroupLabel = (key: string) => {
    if (key === '—') return 'Other';
    const fromGroupLabel = getCategoryGroupLabel(key);
    if (fromGroupLabel !== key) return fromGroupLabel;
    return getSubCategoryLabel(key);
  };

  // Show form overlay
  if (formPOI !== undefined) {
    return (
      <V2POIForm
        poi={formPOI ?? undefined}
        initialCategory={formPOI === null ? (urlCategory as POICategory ?? 'attraction') : undefined}
        onClose={() => setFormPOI(undefined)}
      />
    );
  }

  if (!activeTrip) {
    return (
      <div className="min-h-screen bg-v2-background flex items-center justify-center">
        <p className="text-v2-on-surface-variant font-plus-jakarta">No trip selected</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v2-background text-v2-on-surface font-plus-jakarta">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* ── Back button ── */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/v2/recommendations')}
            className="flex items-center gap-2 text-v2-on-surface-variant hover:text-v2-on-surface text-sm font-bold transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to Recommendations
          </button>
          <button
            onClick={() => setFormPOI(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-v2-primary text-v2-on-primary text-sm font-bold shadow-lg hover:opacity-90 transition-opacity active:scale-95"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Place
          </button>
        </div>

        {/* ── Header ── */}
        <div className="mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-v2-secondary font-bold mb-2 block">
            Curated Intelligence
          </span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-v2-on-surface leading-none mb-4">
            Attractions
          </h1>
          <p className="text-v2-on-surface-variant text-sm">
            {filtered.length} place{filtered.length !== 1 ? 's' : ''} organized by type
          </p>
        </div>

        {/* ── Search + filters ── */}
        <div className="mb-10 space-y-4">
          {/* Search bar */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-v2-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search attractions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl pl-11 pr-4 py-3 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-v2-primary/30"
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto v2-hide-scrollbar pb-1">
            {(['all', 'attraction', 'service'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                  categoryFilter === cat
                    ? 'bg-v2-primary text-v2-on-primary shadow-lg'
                    : 'bg-v2-surface-container-high text-v2-on-surface-variant hover:bg-v2-surface-container-highest'
                }`}
              >
                {cat === 'all' ? 'All types' : cat === 'attraction' ? 'Attractions' : 'Services'}
              </button>
            ))}
          </div>

          {/* Status chips */}
          <div className="flex gap-2 overflow-x-auto v2-hide-scrollbar pb-1">
            {STATUS_FILTER_OPTS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  statusFilter === opt.key
                    ? 'bg-v2-surface-container-lowest text-v2-on-surface border border-v2-outline-variant shadow-sm'
                    : 'text-v2-on-surface-variant border border-transparent hover:border-v2-outline-variant'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Groups ── */}
        {groups.length === 0 ? (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-6xl text-v2-on-surface-variant/20 mb-4 block">
              travel_explore
            </span>
            <p className="text-v2-on-surface-variant font-medium">
              {pois.filter(p => ALLOWED.includes(p.category)).length === 0
                ? 'No attractions yet — ask the AI to suggest some!'
                : 'No results for the current filter'}
            </p>
          </div>
        ) : (
          groups.map(([key, items]) => (
            <CategorySection
              key={key}
              title={getGroupLabel(key)}
              items={items}
              onOpenPOI={(poi) => setFormPOI(poi)}
            />
          ))
        )}

      </div>
    </div>
  );
}
