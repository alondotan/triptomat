import { useState, useEffect } from 'react';
import { usePOI } from '@/context/POIContext';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Plus, Quote, Save, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SubCategorySelector } from '@/components/shared/SubCategorySelector';
import { LocationSelector } from '@/components/shared/LocationSelector';
import type { PointOfInterest, POICategory, POIStatus, POIBooking } from '@/types/trip';
import { getPOICategories, getCategoryLabel } from '@/lib/subCategoryConfig';
import { syncActivityBookingsToDays } from '@/services/itineraryService';
import { useTripMode } from '@/hooks/useTripMode';
import { TripDaySelect } from '@/components/shared/TripDaySelect';
import { useIsMobile } from '@/hooks/use-mobile';
import { AccommodationMiniMap } from './AccommodationMiniMap';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];

const statusLabels: Record<string, string> = {
  suggested: 'מוצע',
  interested: 'מעניין',
  planned: 'מתוכנן',
  scheduled: 'בלו״ז',
  booked: 'הוזמן',
  visited: 'בוקר',
  skipped: 'דילגתי',
};
import type { SourceRecommendation } from '@/types/webhook';
import { supabase } from '@/integrations/supabase/client';

interface POIDetailDialogProps {
  poi: PointOfInterest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RecommendationQuote {
  paragraph: string;
  sourceUrl?: string;
  recommendationId: string;
}

export function POIDetailDialog({ poi, open, onOpenChange }: POIDetailDialogProps) {
  const { updatePOI } = usePOI();
  const { activeTrip, tripSitesHierarchy } = useActiveTrip();
  const { isResearch, isPlanning } = useTripMode();

  // Editable fields
  const [name, setName] = useState(poi.name);
  const [category, setCategory] = useState<POICategory>(poi.category);
  const [subCategory, setSubCategory] = useState(poi.subCategory || '');
  const [isBooked, setIsBooked] = useState(poi.status === 'booked');
  const [city, setCity] = useState(poi.location.city || '');
  const [country, setCountry] = useState(poi.location.country || '');
  const [address, setAddress] = useState(poi.location.address || '');
  const [costAmount, setCostAmount] = useState(poi.details.cost?.amount?.toString() || '');
  const [costCurrency, setCostCurrency] = useState(poi.details.cost?.currency || activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(poi.isPaid);
  const [notes, setNotes] = useState(poi.details.notes?.user_summary || '');

  // Accommodation fields
  const [checkinDate, setCheckinDate] = useState(poi.details.accommodation_details?.checkin?.date || '');
  const [checkinHour, setCheckinHour] = useState(poi.details.accommodation_details?.checkin?.hour || '');
  const [checkoutDate, setCheckoutDate] = useState(poi.details.accommodation_details?.checkout?.date || '');
  const [checkoutHour, setCheckoutHour] = useState(poi.details.accommodation_details?.checkout?.hour || '');
  const [roomType, setRoomType] = useState(poi.details.accommodation_details?.rooms?.[0]?.room_type || '');
  const [occupancy, setOccupancy] = useState(poi.details.accommodation_details?.rooms?.[0]?.occupancy || '');
  const [freeCancellationUntil, setFreeCancellationUntil] = useState(
    poi.details.accommodation_details?.free_cancellation_until
      ? poi.details.accommodation_details.free_cancellation_until.slice(0, 16)
      : ''
  );

  // Booking fields (multiple time slots)
  const [bookings, setBookings] = useState<Array<{ date: string; hour: string }>>(
    (poi.details.bookings || []).map(b => ({
      date: b.reservation_date || '',
      hour: b.reservation_hour || '',
    }))
  );
  const [orderNumber, setOrderNumber] = useState(poi.details.order_number || '');
  const [duration, setDuration] = useState(poi.details.activity_details?.duration?.toString() || '');

  // Recommendation quotes
  const [quotes, setQuotes] = useState<RecommendationQuote[]>([]);

  // Reset fields when poi changes
  useEffect(() => {
    setName(poi.name);
    setCategory(poi.category);
    setSubCategory(poi.subCategory || '');
    setIsBooked(poi.status === 'booked');
    setCity(poi.location.city || '');
    setCountry(poi.location.country || '');
    setAddress(poi.location.address || '');
    setCostAmount(poi.details.cost?.amount?.toString() || '');
    setCostCurrency(poi.details.cost?.currency || activeTrip?.currency || 'ILS');
    setIsPaid(poi.isPaid);
    setNotes(poi.details.notes?.user_summary || '');
    setCheckinDate(poi.details.accommodation_details?.checkin?.date || '');
    setCheckinHour(poi.details.accommodation_details?.checkin?.hour || '');
    setCheckoutDate(poi.details.accommodation_details?.checkout?.date || '');
    setCheckoutHour(poi.details.accommodation_details?.checkout?.hour || '');
    setRoomType(poi.details.accommodation_details?.rooms?.[0]?.room_type || '');
    setOccupancy(poi.details.accommodation_details?.rooms?.[0]?.occupancy || '');
    setBookings((poi.details.bookings || []).map(b => ({
      date: b.reservation_date || '',
      hour: b.reservation_hour || '',
    })));
    setOrderNumber(poi.details.order_number || '');
    setDuration(poi.details.activity_details?.duration?.toString() || '');
  }, [poi]);

  // Fetch recommendation quotes
  useEffect(() => {
    if (!open) return;
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
  }, [open, poi]);

  const handleSave = async () => {
    // Auto-compute status from bookings and booked toggle
    let finalStatus: POIStatus = poi.status;
    if (isBooked) {
      finalStatus = 'booked';
    } else if (!['visited', 'skipped'].includes(poi.status)) {
      const hasTime = bookings.some(b => b.date && b.hour);
      const hasDate = bookings.some(b => b.date);
      if (hasTime) finalStatus = 'scheduled';
      else if (hasDate) finalStatus = 'planned';
      else if (poi.status === 'booked' || poi.status === 'scheduled' || poi.status === 'planned') {
        // Was booked/scheduled/planned but all dates/times removed → downgrade to interested
        finalStatus = 'interested';
      }
    }

    const updatedPOI: PointOfInterest = {
      ...poi,
      isPaid,
      name,
      category,
      subCategory: subCategory || undefined,
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
        bookings: bookings.filter(b => b.date).map(b => ({
          reservation_date: b.date,
          reservation_hour: b.hour || undefined,
        })),
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
    }

    onOpenChange(false);
  };

  const isMobile = useIsMobile();
  const isAccommodation = category === 'accommodation';
  const hasCoordinates = !!poi.location.coordinates;

  // --- Shared JSX sections ---

  const quotesSection = quotes.length > 0 && (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <Quote size={14} /> המלצות
      </h4>
      {quotes.map((q, i) => (
        <div key={i} className="bg-muted/50 rounded-lg p-3 text-sm space-y-1.5 border border-border/50">
          <p className="text-muted-foreground italic leading-relaxed" dir="auto">{q.paragraph}</p>
          {q.sourceUrl && (
            <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <ExternalLink size={12} /> מקור
            </a>
          )}
        </div>
      ))}
      <Separator />
    </div>
  );

  const detailsSection = (
    <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</span>
      <div className="space-y-2">
        <Label>שם</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>קטגוריה</Label>
          <Select value={category} onValueChange={v => setCategory(v as POICategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {getPOICategories().map(c => (
                <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>סטטוס</Label>
          <div className="h-9 flex items-center">
            <Badge variant={poi.status === 'booked' ? 'default' : 'secondary'}>
              {statusLabels[poi.status] || poi.status}
            </Badge>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>תת-קטגוריה</Label>
        <SubCategorySelector categoryFilter={category} value={subCategory} onChange={setSubCategory} placeholder="בחר תת-קטגוריה..." />
      </div>
    </div>
  );

  const locationSection = (
    <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</span>
      <div className="space-y-2">
        <Label>מיקום</Label>
        <LocationSelector
          countries={activeTrip?.countries || (country ? [country] : [])}
          value={city}
          onChange={setCity}
          placeholder="בחר מיקום..."
          extraHierarchy={tripSitesHierarchy}
        />
      </div>
      <div className="space-y-2">
        <Label>כתובת</Label>
        <Input value={address} onChange={e => setAddress(e.target.value)} />
      </div>
    </div>
  );

  const costSection = (
    <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost & Booking</span>
      <div className="space-y-2">
        <Label>עלות</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="col-span-2" />
          <Select value={costCurrency} onValueChange={setCostCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
        <Label htmlFor="poi-detail-is-booked">הוזמן?</Label>
        <Switch id="poi-detail-is-booked" checked={isBooked} onCheckedChange={setIsBooked} />
      </div>
      <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
        <Label htmlFor="poi-detail-is-paid">שולם?</Label>
        <Switch id="poi-detail-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
      </div>
    </div>
  );

  const accommodationFields = !isResearch && (
    <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accommodation</span>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{isPlanning ? 'יום צ׳ק-אין' : 'תאריך צ׳ק-אין'}</Label>
          {isPlanning ? (
            <TripDaySelect value={checkinDate ? parseInt(checkinDate) || '' : ''} onChange={(v) => setCheckinDate(v ? String(v) : '')} />
          ) : (
            <Input type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)} />
          )}
        </div>
        <div className="space-y-2">
          <Label>שעת צ׳ק-אין</Label>
          <Input type="time" value={checkinHour} onChange={e => setCheckinHour(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{isPlanning ? 'יום צ׳ק-אאוט' : 'תאריך צ׳ק-אאוט'}</Label>
          {isPlanning ? (
            <TripDaySelect value={checkoutDate ? parseInt(checkoutDate) || '' : ''} onChange={(v) => setCheckoutDate(v ? String(v) : '')} />
          ) : (
            <Input type="date" value={checkoutDate} onChange={e => setCheckoutDate(e.target.value)} />
          )}
        </div>
        <div className="space-y-2">
          <Label>שעת צ׳ק-אאוט</Label>
          <Input type="time" value={checkoutHour} onChange={e => setCheckoutHour(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>סוג חדר</Label>
          <Input value={roomType} onChange={e => setRoomType(e.target.value)} placeholder="Double, Suite..." />
        </div>
        <div className="space-y-2">
          <Label>תפוסה</Label>
          <Input value={occupancy} onChange={e => setOccupancy(e.target.value)} placeholder="2 adults" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>ביטול חינם עד</Label>
        <Input type="datetime-local" value={freeCancellationUntil} onChange={e => setFreeCancellationUntil(e.target.value)} />
      </div>
    </div>
  );

  const notesSection = (
    <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
      <div className="space-y-2">
        <Label>מספר הזמנה</Label>
        <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Booking ref..." />
      </div>
      <div className="space-y-2">
        <Label>הערות</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="הוסף הערה..." rows={3} />
      </div>
    </div>
  );

  const scheduleSection = (category === 'eatery' || category === 'attraction') && !isResearch && (
    <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Schedule</span>
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
            <Input type="date" value={slot.date} className="flex-1 min-w-0 w-0 px-1.5" onChange={e => {
              const next = [...bookings];
              next[i] = { ...slot, date: e.target.value };
              setBookings(next);
            }} />
          )}
          <Input type="time" value={slot.hour} className="w-[80px] shrink-0 px-1.5" disabled={!slot.date} onChange={e => {
            const next = [...bookings];
            next[i] = { ...slot, hour: e.target.value };
            setBookings(next);
          }} />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => {
            setBookings(bookings.filter((_, j) => j !== i));
          }}>
            <X size={14} />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setBookings([...bookings, { date: '', hour: '' }])}>
        <Plus size={14} /> הוסף זמן
      </Button>
      <div className="space-y-2">
        <Label>משך זמן</Label>
        <div className="flex flex-wrap gap-1.5 items-center">
          {[
            { label: '30 דק׳', value: '30' },
            { label: 'שעה', value: '60' },
            { label: '1.5 שעות', value: '90' },
            { label: '2 שעות', value: '120' },
            { label: '3 שעות', value: '180' },
            { label: 'יום שלם', value: '480' },
          ].map(opt => (
            <Badge
              key={opt.value}
              variant={duration === opt.value ? 'default' : 'outline'}
              className="cursor-pointer select-none text-xs"
              onClick={() => setDuration(duration === opt.value ? '' : opt.value)}
            >
              {opt.label}
            </Badge>
          ))}
          <Input type="number" value={!['30','60','90','120','180','480'].includes(duration) ? duration : ''} className="w-[70px] h-7 px-1.5 text-xs" placeholder="דק׳" min="0" onChange={e => setDuration(e.target.value)} />
        </div>
      </div>
    </div>
  );

  // --- Desktop Layout (all POI types) ---
  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0 flex flex-col [&>button:last-child]:hidden" onOpenAutoFocus={e => e.preventDefault()}>
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <DialogHeader className="p-0">
                <DialogTitle className="text-xl font-semibold truncate">{poi.name}</DialogTitle>
              </DialogHeader>
              <Badge variant={poi.status === 'booked' ? 'default' : 'secondary'} className="shrink-0">
                {statusLabels[poi.status] || poi.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={handleSave} size="sm" className="gap-1.5">
                <Save size={14} /> שמור
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => onOpenChange(false)}>
                <X size={16} />
              </Button>
            </div>
          </div>

          {/* Three-column body */}
          <div className="grid grid-cols-3 gap-0 px-6 pb-6 overflow-y-auto min-h-0">
            {/* Left column — visual panel + location */}
            <div className="pe-5 space-y-4">
              {poi.imageUrl && (
                <div className="w-full aspect-[4/3] overflow-hidden rounded-xl">
                  <img src={poi.imageUrl} alt={poi.name} className="w-full h-full object-cover" />
                </div>
              )}
              {hasCoordinates && (
                <AccommodationMiniMap coordinates={poi.location.coordinates} className="w-full h-48" />
              )}
              {locationSection}
              {quotesSection}
            </div>

            {/* Middle column — details & category-specific fields */}
            <div className="space-y-4 px-5 border-x">
              {detailsSection}
              {isAccommodation && accommodationFields}
              {scheduleSection}
            </div>

            {/* Right column — cost & notes */}
            <div className="space-y-4 ps-5">
              {costSection}
              {notesSection}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Mobile Layout (all POI types) ---
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-lg">{poi.name}</DialogTitle>
        </DialogHeader>

        {poi.imageUrl && (
          <div className="w-full h-48 overflow-hidden rounded-lg -mt-2">
            <img src={poi.imageUrl} alt={poi.name} className="w-full h-full object-cover" />
          </div>
        )}

        {quotesSection}

        <div className="space-y-5">
          {detailsSection}
          {locationSection}

          {/* Mini map after location */}
          {hasCoordinates && (
            <AccommodationMiniMap coordinates={poi.location.coordinates} className="w-full h-40" />
          )}

          {costSection}
          {isAccommodation && accommodationFields}
          {scheduleSection}
          {notesSection}

          <Button onClick={handleSave} className="w-full gap-1.5">
            <Save size={16} /> שמור שינויים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
