/**
 * V2 Accommodation page — hotel/lodging list with Midnight Cartographer design
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalizeLocation } from '@/features/geodata/useLocationDescriptions';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { V2POIForm } from '@/features/v2/forms/V2POIForm';
import type { PointOfInterest, POIStatus } from '@/types/trip';

const STATUS_COLORS: Record<POIStatus, string> = {
  suggested:  'bg-v2-surface-container-high text-v2-on-surface-variant',
  interested: 'bg-blue-900/40 text-blue-300',
  planned:    'bg-indigo-900/40 text-indigo-300',
  scheduled:  'bg-v2-primary/20 text-v2-primary',
  booked:     'bg-v2-secondary/20 text-v2-secondary',
  visited:    'bg-emerald-900/40 text-emerald-300',
  skipped:    'bg-v2-surface-container text-v2-on-surface-variant',
};

function HotelCard({ poi, onOpen }: { poi: PointOfInterest; onOpen: () => void }) {
  const localizeLocation = useLocalizeLocation();
  const city = localizeLocation(poi.location.city ?? poi.location.country);
  const checkin = poi.details.accommodation_details?.checkin?.date;
  const checkout = poi.details.accommodation_details?.checkout?.date;

  return (
    <div className="group cursor-pointer rounded-3xl overflow-hidden bg-v2-surface-container-high hover:-translate-y-1 transition-all duration-300 shadow-lg" onClick={onOpen}>
      {/* Image */}
      <div className="relative h-44 overflow-hidden">
        {poi.imageUrl ? (
          <img src={poi.imageUrl} alt={poi.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-teal-950 to-cyan-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3">
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${STATUS_COLORS[poi.status] ?? ''}`}>
            {poi.status}
          </span>
        </div>
        <div className="absolute top-3 left-3">
          <span className="bg-black/40 backdrop-blur-md text-v2-tertiary px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-v2-tertiary/20">
            Lodging
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-base font-bold text-v2-on-surface mb-1 line-clamp-1 font-plus-jakarta">{poi.name}</h3>
        {city && (
          <p className="text-v2-on-surface-variant text-xs flex items-center gap-1 mb-2">
            <span className="material-symbols-outlined text-v2-tertiary" style={{ fontSize: 12 }}>location_on</span>
            <span className="uppercase tracking-widest font-bold">{city}</span>
          </p>
        )}
        {(checkin || checkout) && (
          <div className="flex items-center gap-2 text-v2-on-surface-variant text-xs">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            <span>{checkin ?? '—'} → {checkout ?? '—'}</span>
          </div>
        )}
        {poi.details.cost?.amount && (
          <p className="text-v2-secondary text-xs font-bold mt-2">
            {poi.details.cost.currency} {poi.details.cost.amount}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AccommodationV2() {
  const navigate = useNavigate();
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();

  const [formPOI, setFormPOI] = useState<PointOfInterest | null | undefined>(undefined);
  const [search, setSearch] = useState('');

  const hotels = useMemo(() => {
    let list = pois.filter(p => p.category === 'accommodation');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.location.city ?? '').toLowerCase().includes(q)
      );
    }
    // Sort by check-in date
    return list.sort((a, b) => {
      const da = a.details.accommodation_details?.checkin?.date ?? '';
      const db = b.details.accommodation_details?.checkin?.date ?? '';
      return da.localeCompare(db);
    });
  }, [pois, search]);

  // Show form overlay (after all hooks)
  if (formPOI !== undefined) {
    return (
      <V2POIForm
        poi={formPOI ?? undefined}
        initialCategory="accommodation"
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-v2-tertiary text-v2-on-tertiary text-sm font-bold shadow-lg hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Hotel
          </button>
        </div>

        {/* ── Header ── */}
        <div className="mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-v2-tertiary font-bold mb-2 block">Lodging</span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-v2-on-surface leading-none mb-4">
            Accommodation
          </h1>
          <p className="text-v2-on-surface-variant text-sm">
            {hotels.length} hotel{hotels.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* ── Search ── */}
        <div className="mb-10">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-v2-on-surface-variant text-[18px]">search</span>
            <input
              type="text"
              placeholder="Search hotels…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl pl-11 pr-4 py-3 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-v2-tertiary/30"
            />
          </div>
        </div>

        {/* ── Grid ── */}
        {hotels.length === 0 ? (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-6xl text-v2-on-surface-variant/20 mb-4 block">hotel</span>
            <p className="text-v2-on-surface-variant font-medium">
              {pois.filter(p => p.category === 'accommodation').length === 0
                ? 'No hotels yet — add one!'
                : 'No results for the current filter'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {hotels.map(poi => (
              <HotelCard key={poi.id} poi={poi} onOpen={() => setFormPOI(poi)} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
