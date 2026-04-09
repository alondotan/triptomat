import { useState, useEffect } from 'react';
import { useLocalizeLocation } from '@/features/geodata/useLocationDescriptions';
import { useTranslation } from 'react-i18next';
import { usePOI } from '@/features/poi/POIContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Pencil, Plus, Quote, Save, Trash2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { SubCategorySelector } from '@/shared/components/SubCategorySelector';
import { LocationSelector } from '@/shared/components/LocationSelector';
import type { PointOfInterest, POICategory, POIStatus, POIBooking } from '@/types/trip';
import { getPOICategories, getCategoryLabel, getSubCategoryEntry } from '@/shared/lib/subCategoryConfig';
import { syncActivityBookingsToDays } from '@/features/itinerary/itineraryService';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { useTripMode } from '@/shared/hooks/useTripMode';
import { TripDaySelect } from '@/shared/components/TripDaySelect';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { AccommodationMiniMap } from './AccommodationMiniMap';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];

const STATUS_KEYS: Record<string, string> = {
  suggested: 'status.suggested',
  interested: 'status.interested',
  planned: 'status.planned',
  scheduled: 'status.scheduled',
  booked: 'status.booked',
  visited: 'status.visited',
  skipped: 'status.skipped',
};
import { supabase } from '@/integrations/supabase/client';

interface POIDetailDialogProps {
  /** Existing POI to edit. When omitted, the dialog is in create mode. */
  poi?: PointOfInterest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Create mode only: pre-fill the category (e.g. 'accommodation' from FAB) */
  initialCategory?: POICategory;
}

interface RecommendationQuote {
  paragraph: string;
  sourceUrl?: string;
  recommendationId: string;
}

export function POIDetailDialog({ poi, open, onOpenChange, initialCategory }: POIDetailDialogProps) {
  const { t } = useTranslation();
  const localizeLocation = useLocalizeLocation();
  const { addPOI, updatePOI, deletePOI } = usePOI();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [imgError, setImgError] = useState(false);
  const { activeTrip } = useActiveTrip();
  const { refetchItinerary } = useItinerary();
  const { isResearch, isPlanning } = useTripMode();

  const isCreateMode = !poi;
  const tripCountries = activeTrip?.countries || [];
  const defaultCountry = tripCountries.length === 1 ? tripCountries[0] : '';

  // Helper: get field defaults from poi or blank
  const defaults = () => ({
    name: poi?.name || '',
    category: poi?.category || initialCategory || 'attraction' as POICategory,
    placeType: poi?.placeType || '',
    activityType: poi?.activityType || '',
    isBooked: poi?.status === 'booked',
    city: poi?.location.city || '',
    country: poi?.location.country || defaultCountry,
    address: poi?.location.address || '',
    costAmount: poi?.details.cost?.amount?.toString() || '',
    costCurrency: poi?.details.cost?.currency || activeTrip?.currency || 'ILS',
    isPaid: poi?.isPaid || false,
    notes: poi?.details.notes?.user_summary || '',
    checkinDate: poi?.details.accommodation_details?.checkin?.date || '',
    checkinHour: poi?.details.accommodation_details?.checkin?.hour || '',
    checkoutDate: poi?.details.accommodation_details?.checkout?.date || '',
    checkoutHour: poi?.details.accommodation_details?.checkout?.hour || '',
    roomType: poi?.details.accommodation_details?.rooms?.[0]?.room_type || '',
    occupancy: poi?.details.accommodation_details?.rooms?.[0]?.occupancy || '',
    freeCancellationUntil: (() => {
      const val = poi?.details.accommodation_details?.free_cancellation_until
        || poi?.details.free_cancellation_until;
      return val ? val.slice(0, 16) : '';
    })(),
    bookings: (poi?.details.bookings || []).map(b => ({
      date: b.reservation_date || (b.trip_day_number != null ? String(b.trip_day_number) : ''),
      hour: b.reservation_hour || '',
    })),
    orderNumber: poi?.details.order_number || '',
    duration: poi?.details.activity_details?.duration?.toString() || '',
  });

  // Editable fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState<POICategory>('attraction');
  const [placeType, setPlaceType] = useState('');
  const [activityType, setActivityType] = useState('');
  const [isBooked, setIsBooked] = useState(false);
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [manualCountry, setManualCountry] = useState(false);
  const [address, setAddress] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(false);
  const [notes, setNotes] = useState('');

  // Accommodation fields
  const [checkinDate, setCheckinDate] = useState('');
  const [checkinHour, setCheckinHour] = useState('');
  const [checkoutDate, setCheckoutDate] = useState('');
  const [checkoutHour, setCheckoutHour] = useState('');
  const [roomType, setRoomType] = useState('');
  const [occupancy, setOccupancy] = useState('');
  const [freeCancellationUntil, setFreeCancellationUntil] = useState('');

  // Booking fields (multiple time slots)
  const [bookings, setBookings] = useState<Array<{ date: string; hour: string }>>([]);
  const [orderNumber, setOrderNumber] = useState('');
  const [duration, setDuration] = useState('');
  const DURATION_PRESETS = ['30','60','90','120','180','480'];
  const [isCustomDuration, setIsCustomDuration] = useState(false);

  // Recommendation quotes
  const [quotes, setQuotes] = useState<RecommendationQuote[]>([]);

  // Reset all fields from defaults when dialog opens or poi changes
  const resetFields = () => {
    const d = defaults();
    setName(d.name);
    setCategory(d.category);
    setPlaceType(d.placeType);
    setActivityType(d.activityType);
    setIsBooked(d.isBooked);
    setCity(d.city);
    setCountry(d.country);
    setManualCountry(false);
    setAddress(d.address);
    setCostAmount(d.costAmount);
    setCostCurrency(d.costCurrency);
    setIsPaid(d.isPaid);
    setNotes(d.notes);
    setCheckinDate(d.checkinDate);
    setCheckinHour(d.checkinHour);
    setCheckoutDate(d.checkoutDate);
    setCheckoutHour(d.checkoutHour);
    setRoomType(d.roomType);
    setOccupancy(d.occupancy);
    setFreeCancellationUntil(d.freeCancellationUntil);
    setBookings(d.bookings);
    setOrderNumber(d.orderNumber);
    setDuration(d.duration);
    setIsCustomDuration(d.duration !== '' && !DURATION_PRESETS.includes(d.duration));
    setEditingName(false);
    setShowDeleteConfirm(false);
  };

  // Reset fields when dialog opens or poi changes
  useEffect(() => {
    if (open) { resetFields(); setImgError(false); }
  }, [open, poi?.id]);

  // Auto-fill activityType from placeType when the place entry also has is_activity
  useEffect(() => {
    if (!placeType) return;
    const entry = getSubCategoryEntry(placeType);
    if (entry?.is_activity) setActivityType(placeType);
  }, [placeType]);

  // Fetch recommendation quotes (edit mode only)
  useEffect(() => {
    if (!open || !poi) { setQuotes([]); return; }
    const recIds = poi.sourceRefs.recommendation_ids || [];
    const detailQuotes: RecommendationQuote[] = [];

    // Check inline details first (from webhook)
    const details = poi.details as Record<string, unknown>;
    if (details.paragraph) {
      detailQuotes.push({
        paragraph: details.paragraph as string,
        sourceUrl: details.source_url as string | undefined,
        recommendationId: 'inline',
      });
    }

    if (recIds.length > 0) {
      supabase
        .from('source_recommendations')
        .select('id, source_url, analysis')
        .in('id', recIds)
        .then(({ data }) => {
          const fetchedQuotes: RecommendationQuote[] = [];
          data?.forEach(rec => {
            const analysis = rec.analysis as Record<string, unknown> | null;
            const items = (analysis?.extracted_items || analysis?.recommendations || []) as Array<{ name: string; paragraph: string }>;
            const matchingItem = items.find(item =>
              item.name.toLowerCase().includes(poi.name.toLowerCase()) ||
              poi.name.toLowerCase().includes(item.name.toLowerCase())
            );
            if (matchingItem) {
              fetchedQuotes.push({
                paragraph: matchingItem.paragraph,
                sourceUrl: rec.source_url || undefined,
                recommendationId: rec.id,
              });
            }
          });
          // Merge, avoid duplicates
          const allQuotes = [...detailQuotes];
          for (const fq of fetchedQuotes) {
            if (!allQuotes.some(q => q.paragraph === fq.paragraph)) {
              allQuotes.push(fq);
            }
          }
          setQuotes(allQuotes);
        });
    } else {
      setQuotes(detailQuotes);
    }
  }, [open, poi?.id]);

  const handleSave = async () => {
    if (!activeTrip) return;
    if (!name.trim()) return;

    // Auto-compute status from bookings and booked toggle
    let finalStatus: POIStatus = poi?.status || 'suggested';
    if (isBooked) {
      finalStatus = 'booked';
    } else if (!poi || !['visited', 'skipped'].includes(poi.status)) {
      const hasTime = bookings.some(b => b.date && b.hour);
      const hasDate = bookings.some(b => b.date);
      if (hasTime) finalStatus = 'scheduled';
      else if (hasDate) finalStatus = 'planned';
      else if (poi && (poi.status === 'booked' || poi.status === 'scheduled' || poi.status === 'planned')) {
        finalStatus = 'interested';
      }
    }

    const builtBookings = bookings.filter(b => b.date).map(b => ({
      ...(isPlanning
        ? { trip_day_number: parseInt(b.date) }
        : { reservation_date: b.date }),
      reservation_hour: b.hour || undefined,
    }));

    if (isCreateMode) {
      // --- Create mode ---
      await addPOI({
        tripId: activeTrip.id,
        category,
        placeType: placeType || undefined,
        activityType: activityType || undefined,
        name: name.trim(),
        status: finalStatus,
        location: {
          city: city || undefined,
          country: country || undefined,
          address: address || undefined,
        },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        details: {
          cost: costAmount ? { amount: parseFloat(costAmount), currency: costCurrency } : undefined,
          notes: notes ? { user_summary: notes } : undefined,
          order_number: orderNumber || undefined,
          bookings: builtBookings,
          activity_details: (category === 'eatery' || category === 'attraction') && duration
            ? { duration: parseInt(duration) } : undefined,
          accommodation_details: category === 'accommodation' ? {
            checkin: (checkinDate || checkinHour) ? { date: checkinDate || undefined, hour: checkinHour || undefined } : undefined,
            checkout: (checkoutDate || checkoutHour) ? { date: checkoutDate || undefined, hour: checkoutHour || undefined } : undefined,
            rooms: roomType ? [{ room_type: roomType, occupancy: occupancy || undefined }] : undefined,
            free_cancellation_until: freeCancellationUntil ? `${freeCancellationUntil}:00` : undefined,
          } : undefined,
        },
        isCancelled: false,
        isPaid,
      });
    } else {
      // --- Edit mode ---
      const updatedPOI: PointOfInterest = {
        ...poi,
        isPaid,
        name: name.trim(),
        category,
        placeType: placeType || undefined,
        activityType: activityType || undefined,
        status: finalStatus,
        location: {
          ...poi.location,
          city: city || undefined,
          country: country || undefined,
          address: address || undefined,
        },
        details: {
          ...poi.details,
          cost: costAmount ? { amount: parseFloat(costAmount), currency: costCurrency } : poi.details.cost,
          notes: notes ? { ...poi.details.notes, user_summary: notes } : poi.details.notes,
          order_number: orderNumber || poi.details.order_number,
          free_cancellation_until: category !== 'accommodation'
            ? (freeCancellationUntil ? `${freeCancellationUntil}:00` : null)
            : poi.details.free_cancellation_until,
          bookings: builtBookings,
          activity_details: (category === 'eatery' || category === 'attraction') ? {
            ...poi.details.activity_details,
            duration: duration ? parseInt(duration) : undefined,
          } : poi.details.activity_details,
          accommodation_details: category === 'accommodation' ? {
            ...poi.details.accommodation_details,
            checkin: (checkinDate || checkinHour) ? { date: checkinDate || undefined, hour: checkinHour || undefined } : poi.details.accommodation_details?.checkin,
            checkout: (checkoutDate || checkoutHour) ? { date: checkoutDate || undefined, hour: checkoutHour || undefined } : poi.details.accommodation_details?.checkout,
            rooms: roomType ? [{ room_type: roomType, occupancy: occupancy || undefined }] : poi.details.accommodation_details?.rooms,
            free_cancellation_until: freeCancellationUntil ? `${freeCancellationUntil}:00` : null,
          } : poi.details.accommodation_details,
        },
      };

      await updatePOI(updatedPOI);

      // Sync bookings to itinerary days (add/move/remove from days by date)
      if (category === 'eatery' || category === 'attraction') {
        const savedBookings: POIBooking[] = updatedPOI.details.bookings || [];
        await syncActivityBookingsToDays(poi.tripId, poi.id, savedBookings);
        await refetchItinerary();
      }
    }

    onOpenChange(false);
  };

  const handleCancel = () => {
    resetFields();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (poi) {
      await deletePOI(poi.id);
      onOpenChange(false);
    }
  };

  const isMobile = useIsMobile();
  const isAccommodation = category === 'accommodation';
  const hasCoordinates = !!poi?.location.coordinates;

  // --- Shared JSX sections ---

  const quotesSection = quotes.length > 0 && (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <Quote size={14} aria-hidden="true" /> {t('poiDetail.recommendations')}
      </h4>
      <div className="space-y-2">
        {quotes.map((q, i) => (
          <div key={i} className="bg-muted/50 rounded-lg p-2.5 text-sm space-y-1 border border-border/50">
            <p className="text-muted-foreground italic leading-relaxed" dir="auto">{q.paragraph}</p>
            {q.sourceUrl && (
              <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink size={12} aria-hidden="true" /> {t('poiDetail.source')}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const detailsSection = (
    <div className="rounded-xl bg-secondary/40 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>{t('poiDetail.category')}</Label>
          <Select value={category} onValueChange={v => setCategory(v as POICategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {getPOICategories().map(c => (
                <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('poiDetail.placeType')}</Label>
          {category === 'accommodation' || category === 'eatery' || category === 'service' || category === 'event' ? (
            <SubCategorySelector categoryFilter={category} value={placeType} onChange={setPlaceType} placeholder={t('poiDetail.choosePlaceType')} />
          ) : (
            <SubCategorySelector flagFilter="physical" value={placeType} onChange={setPlaceType} placeholder={t('poiDetail.choosePlaceType')} />
          )}
        </div>
        {category === 'attraction' && (
          <div className="space-y-1">
            <Label>{t('poiDetail.activityType')}</Label>
            <SubCategorySelector flagFilter="activity" value={activityType} onChange={setActivityType} placeholder={t('poiDetail.chooseActivityType')} />
          </div>
        )}
      </div>
    </div>
  );

  const locationSection = (
    <div className="rounded-xl bg-secondary/40 p-3 space-y-2">
      <div className="space-y-1">
        <Label>{t('poiDetail.country')}</Label>
        {manualCountry ? (
          <div className="flex gap-1">
            <Input name="country" value={country} onChange={e => setCountry(e.target.value)} placeholder={t('createPOI.enterCountryManually')} className="flex-1" autoComplete="off" />
            <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setManualCountry(false)}>
              {t('createPOI.list')}
            </Button>
          </div>
        ) : tripCountries.length > 0 ? (
          <div className="flex gap-1">
            <Select value={country} onValueChange={v => { setCountry(v); setCity(''); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t('createPOI.chooseCountry')} /></SelectTrigger>
              <SelectContent>
                {tripCountries.map(c => (
                  <SelectItem key={c} value={c}>{localizeLocation(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => setManualCountry(true)} title={t('createPOI.enterCountryManually')} aria-label={t('createPOI.editCountry')}>
              <Pencil size={14} />
            </Button>
          </div>
        ) : (
          <Input name="country" value={country} onChange={e => setCountry(e.target.value)} placeholder={t('poiDetail.country')} autoComplete="off" />
        )}
      </div>
      <div className="space-y-1">
        <Label>{t('poiDetail.location')}</Label>
        <LocationSelector
          value={city}
          onChange={setCity}
          placeholder={t('locationSelector.chooseLocation')}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('poiDetail.address')}</Label>
        <Input name="address" value={address} onChange={e => setAddress(e.target.value)} autoComplete="street-address" />
      </div>
    </div>
  );

  const costSection = (
    <div className="rounded-xl bg-secondary/40 p-3 space-y-2">
      <div className="space-y-1">
        <Label>{t('poiDetail.cost')}</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input name="cost" type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="col-span-2" />
          <Select value={costCurrency} onValueChange={setCostCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2">
        <Label htmlFor="poi-detail-is-booked">{t('poiDetail.booked')}</Label>
        <Switch id="poi-detail-is-booked" checked={isBooked} onCheckedChange={setIsBooked} />
      </div>
      <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2">
        <Label htmlFor="poi-detail-is-paid">{t('poiDetail.paid')}</Label>
        <Switch id="poi-detail-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
      </div>
      <div className="space-y-1">
        <Label>{t('poiDetail.freeCancellationUntil')}</Label>
        <Input name="freeCancellationUntil" type="datetime-local" value={freeCancellationUntil} onChange={e => setFreeCancellationUntil(e.target.value)} />
      </div>
    </div>
  );

  const accommodationFields = (
    <div className="rounded-xl bg-secondary/40 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>{isPlanning ? t('poiDetail.checkinDay') : t('poiDetail.checkinDate')}</Label>
          {isPlanning ? (
            <TripDaySelect value={checkinDate ? parseInt(checkinDate) || '' : ''} onChange={(v) => setCheckinDate(v ? String(v) : '')} />
          ) : (
            <Input name="checkinDate" type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)} />
          )}
        </div>
        <div className="space-y-2">
          <Label>{t('poiDetail.checkinTime')}</Label>
          <Input name="checkinTime" type="time" value={checkinHour} onChange={e => setCheckinHour(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{isPlanning ? t('poiDetail.checkoutDay') : t('poiDetail.checkoutDate')}</Label>
          {isPlanning ? (
            <TripDaySelect value={checkoutDate ? parseInt(checkoutDate) || '' : ''} onChange={(v) => setCheckoutDate(v ? String(v) : '')} />
          ) : (
            <Input name="checkoutDate" type="date" value={checkoutDate} onChange={e => setCheckoutDate(e.target.value)} />
          )}
        </div>
        <div className="space-y-1">
          <Label>{t('poiDetail.checkoutTime')}</Label>
          <Input name="checkoutTime" type="time" value={checkoutHour} onChange={e => setCheckoutHour(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>{t('poiDetail.roomType')}</Label>
          <Input name="roomType" value={roomType} onChange={e => setRoomType(e.target.value)} placeholder={t('poiDetail.roomTypePlaceholder')} />
        </div>
        <div className="space-y-1">
          <Label>{t('poiDetail.occupancy')}</Label>
          <Input name="occupancy" type="number" min="1" value={occupancy} onChange={e => setOccupancy(e.target.value)} placeholder={t('poiDetail.occupancyPlaceholder')} />
        </div>
      </div>
    </div>
  );

  const notesSection = (
    <div className="rounded-xl bg-secondary/40 p-3 space-y-2">
      <div className="space-y-1">
        <Label>{t('poiDetail.orderNumber')}</Label>
        <Input name="orderNumber" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder={t('poiDetail.orderNumberPlaceholder')} />
      </div>
      <div className="space-y-1">
        <Label>{t('poiDetail.notes')}</Label>
        <Textarea name="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('poiDetail.addNote')} rows={3} />
      </div>
    </div>
  );

  const scheduleSection = (category === 'eatery' || category === 'attraction') && !isResearch && (
    <div className="rounded-xl bg-secondary/40 p-3 space-y-2">
      {bookings.length > 3 ? (
        <div className="max-h-[7.5rem] overflow-y-auto space-y-1.5">
          {bookings.map((slot, i) => (
            <div key={i} className="flex gap-1.5 items-center overflow-hidden">
              {isPlanning ? (
                <TripDaySelect
                  value={slot.date ? parseInt(slot.date) || '' : ''}
                  onChange={(v) => {
                    const next = [...bookings];
                    next[i] = { ...slot, date: v ? String(v) : '' };
                    setBookings(next);
                  }}
                  className="flex-1 min-w-0"
                />
              ) : (
                <Input name="scheduleDate" type="date" value={slot.date} className="flex-1 min-w-0 w-0 px-1.5" onChange={e => {
                  const next = [...bookings];
                  next[i] = { ...slot, date: e.target.value };
                  setBookings(next);
                }} />
              )}
              <Input name="scheduleTime" type="time" value={slot.hour} className="w-[80px] shrink-0 px-1.5" disabled={!slot.date} onChange={e => {
                const next = [...bookings];
                next[i] = { ...slot, hour: e.target.value };
                setBookings(next);
              }} />
              <Button variant="ghost" size="icon" aria-label={t('timeline.remove')} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => {
                setBookings(bookings.filter((_, j) => j !== i));
              }}>
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {bookings.map((slot, i) => (
            <div key={i} className="flex gap-1.5 items-center overflow-hidden">
              {isPlanning ? (
                <TripDaySelect
                  value={slot.date ? parseInt(slot.date) || '' : ''}
                  onChange={(v) => {
                    const next = [...bookings];
                    next[i] = { ...slot, date: v ? String(v) : '' };
                    setBookings(next);
                  }}
                  className="flex-1 min-w-0"
                />
              ) : (
                <Input name="scheduleDate" type="date" value={slot.date} className="flex-1 min-w-0 w-0 px-1.5" onChange={e => {
                  const next = [...bookings];
                  next[i] = { ...slot, date: e.target.value };
                  setBookings(next);
                }} />
              )}
              <Input name="scheduleTime" type="time" value={slot.hour} className="w-[80px] shrink-0 px-1.5" disabled={!slot.date} onChange={e => {
                const next = [...bookings];
                next[i] = { ...slot, hour: e.target.value };
                setBookings(next);
              }} />
              <Button variant="ghost" size="icon" aria-label={t('timeline.remove')} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => {
                setBookings(bookings.filter((_, j) => j !== i));
              }}>
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setBookings([...bookings, { date: '', hour: '' }])}>
        <Plus size={14} /> {t('poiDetail.addTime')}
      </Button>
      <div className="flex items-center gap-2">
        <Label className="shrink-0 text-xs">{t('poiDetail.duration')}</Label>
        <Select
          value={isCustomDuration ? 'custom' : duration === '' ? 'none' : duration}
          onValueChange={v => {
            if (v === 'none') { setDuration(''); setIsCustomDuration(false); }
            else if (v === 'custom') { setIsCustomDuration(true); }
            else { setDuration(v); setIsCustomDuration(false); }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-24 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('poiDetail.none')}</SelectItem>
            <SelectItem value="30">{t('poiDetail.min30')}</SelectItem>
            <SelectItem value="60">{t('poiDetail.hour1')}</SelectItem>
            <SelectItem value="90">{t('poiDetail.hours1_5')}</SelectItem>
            <SelectItem value="120">{t('poiDetail.hours2')}</SelectItem>
            <SelectItem value="180">{t('poiDetail.hours3')}</SelectItem>
            <SelectItem value="480">{t('poiDetail.fullDay')}</SelectItem>
            <SelectItem value="custom">{t('poiDetail.otherDuration')}</SelectItem>
          </SelectContent>
        </Select>
        {isCustomDuration && (
          <div className="flex items-center gap-1">
            <Input name="customDuration" type="number" value={duration} className="w-16 h-8 px-1.5 text-xs" placeholder={t('poiDetail.minutes')} min="1" autoFocus onChange={e => setDuration(e.target.value)} />
            <span className="text-xs text-muted-foreground">{t('poiDetail.minutes')}</span>
          </div>
        )}
      </div>
    </div>
  );

  // --- Desktop Layout (all POI types) ---
  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col [&>button:last-child]:hidden" onOpenAutoFocus={e => e.preventDefault()}>
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-2 shrink-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <DialogHeader className="p-0 flex-1 min-w-0">
                {isCreateMode ? (
                  <DialogTitle className="text-xl font-semibold">
                    {t('createPOI.title')}
                  </DialogTitle>
                ) : editingName ? (
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); if (e.key === 'Escape') { setName(poi.name); setEditingName(false); } }}
                    className="text-xl font-semibold h-auto py-0.5 px-1"
                    autoFocus
                  />
                ) : (
                  <DialogTitle className="text-xl font-semibold truncate flex items-center gap-2 group cursor-pointer" onClick={() => setEditingName(true)}>
                    {name}
                    <Pencil size={14} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                  </DialogTitle>
                )}
              </DialogHeader>
              {poi && (
                <Badge variant={poi.status === 'booked' ? 'default' : 'secondary'} className="shrink-0">
                  {STATUS_KEYS[poi.status] ? t(STATUS_KEYS[poi.status]) : poi.status}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {poi && (
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                      <Trash2 size={14} /> {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('poiDetail.deleteConfirm', { name: poi.name })}</AlertDialogTitle>
                      <AlertDialogDescription>{t('poiDetail.cannotUndo')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="outline" size="sm" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} size="sm" className="gap-1.5">
                <Save size={14} /> {isCreateMode ? t('createPOI.addPOI') : t('common.save')}
              </Button>
            </div>
          </div>

          {/* Three-column body */}
          <div className={`gap-0 px-6 pb-4 min-h-0 flex-1 ${isCreateMode ? 'grid grid-cols-2' : 'grid grid-cols-3'}`}>
            {/* Left column — visual panel + location */}
            <div className="pe-4 space-y-3 overflow-y-auto min-h-0">
              {isCreateMode && (
                <div className="space-y-2">
                  <Label>{t('createPOI.name')} *</Label>
                  <Input name="name" value={name} onChange={e => setName(e.target.value)} placeholder={t('createPOI.namePlaceholder')} autoComplete="off" autoFocus />
                </div>
              )}
              {poi?.imageUrl && !imgError && (
                <div className="w-full h-40 overflow-hidden rounded-xl">
                  <img src={poi.imageUrl} alt={poi.name} width={400} height={300} className="w-full h-full object-cover" onError={() => setImgError(true)} />
                </div>
              )}
              {hasCoordinates && poi && (
                <AccommodationMiniMap coordinates={poi.location.coordinates} className="w-full h-40" />
              )}
              {locationSection}
            </div>

            {isCreateMode ? (
              /* Create mode: single right column with all fields */
              <div className="space-y-3 ps-4 border-s overflow-y-auto min-h-0">
                {detailsSection}
                {costSection}
                {isAccommodation && accommodationFields}
                {scheduleSection}
                {notesSection}
              </div>
            ) : (
              <>
                {/* Middle column — categories, schedule, recommendations */}
                <div className="flex flex-col gap-3 px-4 border-x min-h-0">
                  {/* 1. Categories — fixed */}
                  <div className="shrink-0">
                    {detailsSection}
                  </div>
                  {/* 2. Schedule / Accommodation — fixed */}
                  <div className="shrink-0">
                    {isAccommodation && accommodationFields}
                    {scheduleSection}
                  </div>
                  {/* 3. Recommendations — scrollable */}
                  {quotes.length > 0 && (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {quotesSection}
                    </div>
                  )}
                </div>

                {/* Right column — cost & notes */}
                <div className="space-y-3 ps-4 overflow-y-auto min-h-0">
                  {costSection}
                  {notesSection}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Mobile Layout (all POI types) ---
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 !flex !flex-col overflow-hidden" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="pe-8">
          {isCreateMode ? (
            <DialogTitle className="text-lg">{t('createPOI.title')}</DialogTitle>
          ) : editingName ? (
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); if (e.key === 'Escape') { setName(poi.name); setEditingName(false); } }}
              className="text-lg font-semibold h-auto py-0.5 px-1"
              autoFocus
            />
          ) : (
            <DialogTitle className="text-lg flex items-center gap-2" onClick={() => setEditingName(true)}>
              {name}
              <Pencil size={14} className="opacity-40 shrink-0" />
            </DialogTitle>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-4">
          {isCreateMode && (
            <div className="space-y-2">
              <Label>{t('createPOI.name')} *</Label>
              <Input name="name" value={name} onChange={e => setName(e.target.value)} placeholder={t('createPOI.namePlaceholder')} autoComplete="off" autoFocus />
            </div>
          )}

          {poi?.imageUrl && !imgError && (
            <div className="w-full h-48 overflow-hidden rounded-lg">
              <img src={poi.imageUrl} alt={poi.name} width={400} height={300} className="w-full h-full object-cover" onError={() => setImgError(true)} />
            </div>
          )}

          {quotesSection}
          {detailsSection}
          {locationSection}

          {/* Mini map after location */}
          {hasCoordinates && poi && (
            <AccommodationMiniMap coordinates={poi.location.coordinates} className="w-full h-40" />
          )}

          {costSection}
          {isAccommodation && accommodationFields}
          {scheduleSection}
          {notesSection}

          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm" className="flex-1 gap-1">
              <Save size={14} /> {isCreateMode ? t('createPOI.addPOI') : t('common.save')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel} className="flex-1">
              {t('common.cancel')}
            </Button>
            {poi && (
              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1 gap-1 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} /> {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('poiDetail.deleteConfirm', { name: poi.name })}</AlertDialogTitle>
                    <AlertDialogDescription>{t('poiDetail.cannotUndo')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
