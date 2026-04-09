/**
 * V2 POI Add/Edit form — Midnight Cartographer design
 * Handles: attraction, eatery, accommodation, event, service
 * Reuses all existing hooks (usePOI, useActiveTrip, useItinerary)
 */
import { useState, useEffect } from 'react';
import { usePOI } from '@/features/poi/POIContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { syncActivityBookingsToDays } from '@/features/itinerary/itineraryService';
import { SubCategorySelector } from '@/shared/components/SubCategorySelector';
import { getPOICategories, getCategoryLabel, getSubCategoryEntry } from '@/shared/lib/subCategoryConfig';
import type { PointOfInterest, POICategory, POIStatus } from '@/types/trip';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF'];

const STATUS_OPTIONS: { key: POIStatus; label: string; color: string }[] = [
  { key: 'suggested',  label: 'Suggested',  color: 'bg-v2-surface-container-high text-v2-on-surface-variant border-v2-outline-variant/30' },
  { key: 'interested', label: 'Interested', color: 'bg-blue-900/40 text-blue-300 border-blue-700/30' },
  { key: 'planned',    label: 'Planned',    color: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/30' },
  { key: 'booked',     label: 'Booked',     color: 'bg-v2-secondary/20 text-v2-secondary border-v2-secondary/30' },
  { key: 'visited',    label: 'Visited',    color: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/30' },
  { key: 'skipped',    label: 'Skipped',    color: 'bg-v2-surface-container text-v2-on-surface-variant border-v2-outline-variant/20' },
];

interface V2POIFormProps {
  poi?: PointOfInterest;
  initialCategory?: POICategory;
  onClose: () => void;
}

// ─── field components ────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest text-v2-on-surface-variant mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-5 py-3.5 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-v2-primary/30 transition"
    />
  );
}

function TextArea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-5 py-3.5 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-v2-primary/30 transition resize-none"
    />
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function V2POIForm({ poi, initialCategory, onClose }: V2POIFormProps) {
  const { addPOI, updatePOI, deletePOI } = usePOI();
  const { activeTrip } = useActiveTrip();
  const { refetchItinerary } = useItinerary();
  const isEdit = !!poi;

  const tripCountries = activeTrip?.countries || [];
  const defaultCountry = tripCountries.length === 1 ? tripCountries[0] : '';

  // ── state ────────────────────────────────────────────────────────────────
  const [name, setName] = useState(poi?.name || '');
  const [category, setCategory] = useState<POICategory>(poi?.category || initialCategory || 'attraction');
  const [placeType, setPlaceType] = useState(poi?.placeType || '');
  const [activityType, setActivityType] = useState(poi?.activityType || '');
  const [status, setStatus] = useState<POIStatus>(poi?.status || 'suggested');
  const [city, setCity] = useState(poi?.location.city || '');
  const [country, setCountry] = useState(poi?.location.country || defaultCountry);
  const [address, setAddress] = useState(poi?.location.address || '');
  const [notes, setNotes] = useState(poi?.details.notes?.user_summary || '');
  const [costAmount, setCostAmount] = useState(poi?.details.cost?.amount?.toString() || '');
  const [costCurrency, setCostCurrency] = useState(poi?.details.cost?.currency || activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(poi?.isPaid || false);

  // Accommodation
  const [checkinDate, setCheckinDate] = useState(poi?.details.accommodation_details?.checkin?.date || '');
  const [checkinHour, setCheckinHour] = useState(poi?.details.accommodation_details?.checkin?.hour || '');
  const [checkoutDate, setCheckoutDate] = useState(poi?.details.accommodation_details?.checkout?.date || '');
  const [checkoutHour, setCheckoutHour] = useState(poi?.details.accommodation_details?.checkout?.hour || '');
  const [roomType, setRoomType] = useState(poi?.details.accommodation_details?.rooms?.[0]?.room_type || '');
  const [freeCancellation, setFreeCancellation] = useState(() => {
    const val = poi?.details.accommodation_details?.free_cancellation_until || poi?.details.free_cancellation_until;
    return val ? val.slice(0, 16) : '';
  });

  // Booking slots
  const [bookings, setBookings] = useState<Array<{ date: string; hour: string }>>(
    (poi?.details.bookings || []).map(b => ({
      date: b.reservation_date || (b.trip_day_number != null ? String(b.trip_day_number) : ''),
      hour: b.reservation_hour || '',
    }))
  );

  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Auto-fill activityType from placeType when applicable
  useEffect(() => {
    if (!placeType) return;
    const entry = getSubCategoryEntry(placeType);
    if (entry?.is_activity) setActivityType(placeType);
  }, [placeType]);

  // ── save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!activeTrip || !name.trim()) return;
    setSaving(true);

    const builtBookings = bookings.filter(b => b.date).map(b => ({
      reservation_date: b.date,
      reservation_hour: b.hour || undefined,
    }));

    try {
      if (!isEdit) {
        await addPOI({
          tripId: activeTrip.id,
          category,
          placeType: placeType || undefined,
          activityType: activityType || undefined,
          name: name.trim(),
          status,
          location: {
            city: city || undefined,
            country: country || undefined,
            address: address || undefined,
          },
          sourceRefs: { email_ids: [], recommendation_ids: [] },
          details: {
            cost: costAmount ? { amount: parseFloat(costAmount), currency: costCurrency } : undefined,
            notes: notes ? { user_summary: notes } : undefined,
            bookings: builtBookings,
            activity_details: (category === 'eatery' || category === 'attraction') ? undefined : undefined,
            accommodation_details: category === 'accommodation' ? {
              checkin: checkinDate ? { date: checkinDate, hour: checkinHour || undefined } : undefined,
              checkout: checkoutDate ? { date: checkoutDate, hour: checkoutHour || undefined } : undefined,
              rooms: roomType ? [{ room_type: roomType }] : undefined,
              free_cancellation_until: freeCancellation ? `${freeCancellation}:00` : undefined,
            } : undefined,
          },
          isCancelled: false,
          isPaid,
        });
      } else {
        const updated: PointOfInterest = {
          ...poi,
          isPaid,
          name: name.trim(),
          category,
          placeType: placeType || undefined,
          activityType: activityType || undefined,
          status,
          location: { ...poi.location, city: city || undefined, country: country || undefined, address: address || undefined },
          details: {
            ...poi.details,
            cost: costAmount ? { amount: parseFloat(costAmount), currency: costCurrency } : poi.details.cost,
            notes: notes ? { ...poi.details.notes, user_summary: notes } : poi.details.notes,
            bookings: builtBookings,
            accommodation_details: category === 'accommodation' ? {
              ...poi.details.accommodation_details,
              checkin: checkinDate ? { date: checkinDate, hour: checkinHour || undefined } : poi.details.accommodation_details?.checkin,
              checkout: checkoutDate ? { date: checkoutDate, hour: checkoutHour || undefined } : poi.details.accommodation_details?.checkout,
              rooms: roomType ? [{ room_type: roomType }] : poi.details.accommodation_details?.rooms,
              free_cancellation_until: freeCancellation ? `${freeCancellation}:00` : null,
            } : poi.details.accommodation_details,
          },
        };
        await updatePOI(updated);
        if (category === 'eatery' || category === 'attraction') {
          await syncActivityBookingsToDays(poi.tripId, poi.id, updated.details.bookings || []);
          await refetchItinerary();
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!poi) return;
    setSaving(true);
    try {
      await deletePOI(poi.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const categories = getPOICategories();
  const showAccommodationFields = category === 'accommodation';
  const showBookingFields = category !== 'accommodation';

  return (
    <div className="min-h-screen bg-v2-background text-v2-on-surface font-plus-jakarta">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-v2-surface-container-lowest/80 backdrop-blur-xl border-b border-v2-outline-variant/20">
        <div className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-v2-on-surface-variant hover:text-v2-on-surface transition-colors text-sm font-bold"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Cancel
          </button>

          <h1 className="text-base font-black tracking-tight">
            {isEdit ? 'Edit Place' : 'Add Place'}
          </h1>

          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                onClick={() => setShowDelete(true)}
                className="p-2 rounded-xl text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-5 py-2 rounded-xl bg-v2-primary text-v2-on-primary text-sm font-bold disabled:opacity-40 transition-all hover:opacity-90 active:scale-95"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Form body ── */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Name */}
        <div>
          <FieldLabel>Place Name *</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Eiffel Tower"
            className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-5 py-4 text-lg font-bold text-v2-on-surface placeholder:text-v2-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-v2-primary/30 transition"
          />
        </div>

        {/* Category + Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel>Category</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat as POICategory)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                    category === cat
                      ? 'bg-v2-primary text-v2-on-primary border-transparent shadow-lg'
                      : 'bg-v2-surface-container-high text-v2-on-surface-variant border-v2-outline-variant/20 hover:bg-v2-surface-container-highest'
                  }`}
                >
                  {getCategoryLabel(cat)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Type / Sub-category</FieldLabel>
            <div className="[&>div]:w-full">
              <SubCategorySelector
                categoryFilter={category}
                value={placeType || activityType}
                onChange={val => {
                  setPlaceType(val);
                  setActivityType('');
                }}
              />
            </div>
          </div>
        </div>

        {/* Status chips */}
        <div>
          <FieldLabel>Status</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatus(opt.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all border ${
                  status === opt.key
                    ? opt.color + ' shadow-md'
                    : 'bg-transparent text-v2-on-surface-variant border-v2-outline-variant/20 hover:border-v2-outline-variant/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <FieldLabel>Location</FieldLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextInput value={city} onChange={setCity} placeholder="City" />
            <TextInput value={country} onChange={setCountry} placeholder="Country" />
            <TextInput value={address} onChange={setAddress} placeholder="Address (optional)" />
          </div>
        </div>

        {/* Cost */}
        <div>
          <FieldLabel>Cost</FieldLabel>
          <div className="flex gap-3">
            <TextInput value={costAmount} onChange={setCostAmount} placeholder="Amount" type="number" />
            <select
              value={costCurrency}
              onChange={e => setCostCurrency(e.target.value)}
              className="bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-4 py-3.5 text-sm text-v2-on-surface focus:outline-none focus:ring-2 focus:ring-v2-primary/30"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 px-4 py-3.5 bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={e => setIsPaid(e.target.checked)}
                className="accent-v2-primary"
              />
              <span className="text-xs font-bold uppercase tracking-widest text-v2-on-surface-variant">Paid</span>
            </label>
          </div>
        </div>

        {/* Accommodation fields */}
        {showAccommodationFields && (
          <div className="space-y-5 p-5 bg-v2-surface-container rounded-2xl border border-v2-outline-variant/10">
            <p className="text-xs font-black uppercase tracking-widest text-v2-tertiary">Lodging Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Check-in Date</FieldLabel>
                <TextInput value={checkinDate} onChange={setCheckinDate} type="date" />
              </div>
              <div>
                <FieldLabel>Check-in Time</FieldLabel>
                <TextInput value={checkinHour} onChange={setCheckinHour} placeholder="e.g. 14:00" />
              </div>
              <div>
                <FieldLabel>Check-out Date</FieldLabel>
                <TextInput value={checkoutDate} onChange={setCheckoutDate} type="date" />
              </div>
              <div>
                <FieldLabel>Check-out Time</FieldLabel>
                <TextInput value={checkoutHour} onChange={setCheckoutHour} placeholder="e.g. 11:00" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Room Type</FieldLabel>
                <TextInput value={roomType} onChange={setRoomType} placeholder="e.g. Double, Suite" />
              </div>
              <div>
                <FieldLabel>Free Cancellation Until</FieldLabel>
                <TextInput value={freeCancellation} onChange={setFreeCancellation} type="datetime-local" />
              </div>
            </div>
          </div>
        )}

        {/* Booking slots */}
        {showBookingFields && (
          <div className="space-y-4 p-5 bg-v2-surface-container rounded-2xl border border-v2-outline-variant/10">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-v2-secondary">Bookings / Reservations</p>
              <button
                onClick={() => setBookings(b => [...b, { date: '', hour: '' }])}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-v2-secondary/10 text-v2-secondary text-xs font-bold transition-colors hover:bg-v2-secondary/20"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add slot
              </button>
            </div>
            {bookings.length === 0 ? (
              <p className="text-v2-on-surface-variant/50 text-xs">No bookings yet.</p>
            ) : (
              bookings.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input
                    type="date"
                    value={b.date}
                    onChange={e => setBookings(prev => prev.map((x, j) => j === i ? { ...x, date: e.target.value } : x))}
                    className="flex-1 bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-xl px-4 py-2.5 text-sm text-v2-on-surface focus:outline-none focus:ring-2 focus:ring-v2-primary/30"
                  />
                  <input
                    type="time"
                    value={b.hour}
                    onChange={e => setBookings(prev => prev.map((x, j) => j === i ? { ...x, hour: e.target.value } : x))}
                    className="w-28 bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-xl px-4 py-2.5 text-sm text-v2-on-surface focus:outline-none focus:ring-2 focus:ring-v2-primary/30"
                  />
                  <button
                    onClick={() => setBookings(prev => prev.filter((_, j) => j !== i))}
                    className="p-2 text-v2-on-surface-variant/50 hover:text-red-400 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea value={notes} onChange={setNotes} placeholder="Personal notes, recommendations, tips…" rows={4} />
        </div>

      </div>

      {/* ── Delete confirm overlay ── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-v2-surface-container-high rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-black text-v2-on-surface mb-2">Delete this place?</h3>
            <p className="text-v2-on-surface-variant text-sm mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 py-3 rounded-2xl bg-v2-surface-container text-v2-on-surface-variant text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
