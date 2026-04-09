/**
 * V2 Eateries page — restaurant/dining list with Midnight Cartographer design
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalizeLocation } from '@/features/geodata/useLocationDescriptions';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { V2POIForm } from '@/features/v2/forms/V2POIForm';
import type { PointOfInterest, POIStatus } from '@/types/trip';
import { getSubCategoryLabel } from '@/shared/lib/subCategoryConfig';

const STATUS_COLORS: Record<POIStatus, string> = {
  suggested:  'bg-v2-surface-container-high text-v2-on-surface-variant',
  interested: 'bg-blue-900/40 text-blue-300',
  planned:    'bg-indigo-900/40 text-indigo-300',
  scheduled:  'bg-v2-primary/20 text-v2-primary',
  booked:     'bg-v2-secondary/20 text-v2-secondary',
  visited:    'bg-emerald-900/40 text-emerald-300',
  skipped:    'bg-v2-surface-container text-v2-on-surface-variant',
};

const STATUS_FILTER_OPTS: { key: POIStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'suggested', label: 'Suggested' },
  { key: 'planned',   label: 'Planned' },
  { key: 'booked',    label: 'Booked' },
  { key: 'visited',   label: 'Visited' },
];

function EateryCard({ poi, onOpen }: { poi: PointOfInterest; onOpen: () => void }) {
  const localizeLocation = useLocalizeLocation();
  const city = localizeLocation(poi.location.city ?? poi.location.country);
  const typeLabel = poi.placeType ? getSubCategoryLabel(poi.placeType) : null;

  return (
    <div
      className="group cursor-pointer"
      onClick={onOpen}
    >
      <div className="relative rounded-2xl overflow-hidden mb-3 bg-v2-surface-container-high shadow-xl transition-transform duration-500 group-hover:scale-[1.02] aspect-[16/9]">
        {poi.imageUrl ? (
          <img
            src={poi.imageUrl}
            alt={poi.name}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-950 via-orange-950 to-red-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3">
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${STATUS_COLORS[poi.status] ?? ''}`}>
            {poi.status}
          </span>
        </div>
        {poi.details.cost?.amount && (
          <div className="absolute top-3 right-3">
            <span className="bg-black/40 backdrop-blur-md text-white/80 px-2 py-1 rounded-lg text-[10px] font-bold">
              {poi.details.cost.currency} {poi.details.cost.amount}
            </span>
          </div>
        )}
      </div>
      <h3 className="text-base font-bold text-v2-on-surface mb-0.5 line-clamp-1 font-plus-jakarta">
        {poi.name}
      </h3>
      <p className="text-v2-on-surface-variant text-xs flex items-center gap-1.5">
        {city && (
          <>
            <span className="material-symbols-outlined text-v2-secondary" style={{ fontSize: 12 }}>location_on</span>
            <span className="uppercase tracking-widest font-bold">{city}</span>
            {typeLabel && <span className="text-v2-outline">·</span>}
          </>
        )}
        {typeLabel && <span>{typeLabel}</span>}
      </p>
    </div>
  );
}

export default function EateriesV2() {
  const navigate = useNavigate();
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();

  const [formPOI, setFormPOI] = useState<PointOfInterest | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<POIStatus | 'all'>('all');

  const eateries = useMemo(() => {
    let list = pois.filter(p => p.category === 'eatery');
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.location.city ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [pois, statusFilter, search]);

  // Show form overlay (after all hooks)
  if (formPOI !== undefined) {
    return (
      <V2POIForm
        poi={formPOI ?? undefined}
        initialCategory="eatery"
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

        {/* ── Nav row ── */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/v2/recommendations')}
            className="flex items-center gap-2 text-v2-on-surface-variant hover:text-v2-on-surface text-sm font-bold transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back
          </button>
          <button
            onClick={() => setFormPOI(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-v2-secondary text-v2-on-secondary text-sm font-bold shadow-lg hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Restaurant
          </button>
        </div>

        {/* ── Header ── */}
        <div className="mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-v2-secondary font-bold mb-2 block">Dining</span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-v2-on-surface leading-none mb-4">
            Restaurants
          </h1>
          <p className="text-v2-on-surface-variant text-sm">
            {eateries.length} place{eateries.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* ── Search + filters ── */}
        <div className="mb-10 space-y-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-v2-on-surface-variant text-[18px]">search</span>
            <input
              type="text"
              placeholder="Search restaurants…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl pl-11 pr-4 py-3 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-v2-secondary/30"
            />
          </div>
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

        {/* ── Grid ── */}
        {eateries.length === 0 ? (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-6xl text-v2-on-surface-variant/20 mb-4 block">restaurant</span>
            <p className="text-v2-on-surface-variant font-medium">
              {pois.filter(p => p.category === 'eatery').length === 0
                ? 'No restaurants yet — add one!'
                : 'No results for the current filter'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {eateries.map(poi => (
              <EateryCard key={poi.id} poi={poi} onOpen={() => setFormPOI(poi)} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
