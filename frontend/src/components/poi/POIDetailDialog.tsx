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
import type { PointOfInterest, POICategory, POIStatus, POIBooking } from '@/types/trip';
import { syncActivityBookingsToDays } from '@/services/itineraryService';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];
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
  const { activeTrip } = useActiveTrip();

  // Editable fields
  const [name, setName] = useState(poi.name);
  const [category, setCategory] = useState<POICategory>(poi.category);
  const [subCategory, setSubCategory] = useState(poi.subCategory || '');
  const [status, setStatus] = useState<POIStatus>(poi.status);
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

  // Booking fields (multiple time slots)
  const [bookings, setBookings] = useState<Array<{ date: string; hour: string; schedule_state: 'potential' | 'scheduled' }>>(
    (poi.details.bookings || []).map(b => ({
      date: b.reservation_date || '',
      hour: b.reservation_hour || '',
      schedule_state: b.schedule_state || (b.reservation_hour ? 'scheduled' : 'potential'),
    }))
  );
  const [orderNumber, setOrderNumber] = useState(poi.details.order_number || '');

  // Recommendation quotes
  const [quotes, setQuotes] = useState<RecommendationQuote[]>([]);

  // Reset fields when poi changes
  useEffect(() => {
    setName(poi.name);
    setCategory(poi.category);
    setSubCategory(poi.subCategory || '');
    setStatus(poi.status);
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
      schedule_state: b.schedule_state || (b.reservation_hour ? 'scheduled' : 'potential'),
    })));
    setOrderNumber(poi.details.order_number || '');
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
    const updatedPOI: PointOfInterest = {
      ...poi,
      isPaid,
      name,
      category,
      subCategory: subCategory || undefined,
      status,
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
        bookings: bookings.filter(b => b.date || b.hour).map(b => ({
          reservation_date: b.date || undefined,
          reservation_hour: b.schedule_state === 'scheduled' && b.hour ? b.hour : undefined,
          schedule_state: b.schedule_state,
        })),
        accommodation_details: category === 'accommodation' ? {
          ...poi.details.accommodation_details,
          checkin: (checkinDate || checkinHour) ? { date: checkinDate || undefined, hour: checkinHour || undefined } : poi.details.accommodation_details?.checkin,
          checkout: (checkoutDate || checkoutHour) ? { date: checkoutDate || undefined, hour: checkoutHour || undefined } : poi.details.accommodation_details?.checkout,
          rooms: roomType ? [{ room_type: roomType, occupancy: occupancy || undefined }] : poi.details.accommodation_details?.rooms,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{poi.name}</DialogTitle>
        </DialogHeader>

        {/* Recommendation Quotes */}
        {quotes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Quote size={14} /> המלצות
            </h4>
            {quotes.map((q, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 text-sm space-y-1.5 border border-border/50">
                <p className="text-muted-foreground italic leading-relaxed" dir="auto">{q.paragraph}</p>
                {q.sourceUrl && (
                  <a
                    href={q.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> מקור
                  </a>
                )}
              </div>
            ))}
            <Separator />
          </div>
        )}

        {/* Edit Form */}
        <div className="space-y-4">
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
                  <SelectItem value="accommodation">לינה</SelectItem>
                  <SelectItem value="eatery">אוכל</SelectItem>
                  <SelectItem value="attraction">אטרקציה</SelectItem>
                  <SelectItem value="service">שירות</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>סטטוס</Label>
              <Select value={status} onValueChange={v => setStatus(v as POIStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="candidate">מועמד</SelectItem>
                  <SelectItem value="in_plan">בתוכנית</SelectItem>
                  <SelectItem value="booked">הוזמן</SelectItem>
                  <SelectItem value="visited">בוקר</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>תת-קטגוריה</Label>
            <SubCategorySelector categoryFilter={category} value={subCategory} onChange={setSubCategory} placeholder="בחר תת-קטגוריה..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>עיר</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>מדינה</Label>
              <Input value={country} onChange={e => setCountry(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>כתובת</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>

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

          <div className="flex items-center justify-between">
            <Label htmlFor="poi-detail-is-paid">שולם?</Label>
            <Switch id="poi-detail-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>

          {/* Accommodation-specific fields */}
          {category === 'accommodation' && (
            <>
              <Separator />
              <h4 className="text-sm font-semibold">פרטי לינה</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>תאריך צ׳ק-אין</Label>
                  <Input type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>שעת צ׳ק-אין</Label>
                  <Input type="time" value={checkinHour} onChange={e => setCheckinHour(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>תאריך צ׳ק-אאוט</Label>
                  <Input type="date" value={checkoutDate} onChange={e => setCheckoutDate(e.target.value)} />
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
            </>
          )}

          {/* Booking fields for eatery/attraction — multiple time slots */}
          {(category === 'eatery' || category === 'attraction') && (
            <>
              <Separator />
              <h4 className="text-sm font-semibold">זמנים</h4>
              {bookings.map((slot, i) => (
                <div key={i} className="space-y-1 border rounded-md p-2">
                  <div className="flex gap-2 items-center">
                    <Input type="date" value={slot.date} className="flex-1 min-w-0" onChange={e => {
                      const next = [...bookings];
                      next[i] = { ...slot, date: e.target.value };
                      setBookings(next);
                    }} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => {
                      setBookings(bookings.filter((_, j) => j !== i));
                    }}>
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge
                      variant={slot.schedule_state === 'scheduled' ? 'default' : 'outline'}
                      className="cursor-pointer select-none text-xs whitespace-nowrap"
                      onClick={() => {
                        const next = [...bookings];
                        const newState = slot.schedule_state === 'scheduled' ? 'potential' : 'scheduled';
                        next[i] = { ...slot, schedule_state: newState, hour: newState === 'potential' ? '' : slot.hour };
                        setBookings(next);
                      }}
                    >
                      {slot.schedule_state === 'scheduled' ? 'בלו״ז' : 'פוטנציאלי'}
                    </Badge>
                    {slot.schedule_state === 'scheduled' && (
                      <Input type="time" value={slot.hour} className="w-[100px]" onChange={e => {
                        const next = [...bookings];
                        next[i] = { ...slot, hour: e.target.value };
                        setBookings(next);
                      }} />
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setBookings([...bookings, { date: '', hour: '', schedule_state: 'potential' }])}>
                <Plus size={14} /> הוסף זמן
              </Button>
            </>
          )}

          {/* Order number */}
          <div className="space-y-2">
            <Label>מספר הזמנה</Label>
            <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Booking ref..." />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>הערות</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="הוסף הערה..." rows={3} />
          </div>

          <Button onClick={handleSave} className="w-full gap-1.5">
            <Save size={16} /> שמור שינויים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
