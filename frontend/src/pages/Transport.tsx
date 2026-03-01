import { useState, useMemo } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useTransport } from '@/context/TransportContext';
import { useItinerary } from '@/context/ItineraryContext';
import { useFinance } from '@/context/FinanceContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateTransportForm } from '@/components/forms/CreateTransportForm';
import { TransportDetailDialog } from '@/components/TransportDetailDialog';
import { Plane, Train, Ship, Bus, Car, Trash2, Filter, Search, Merge } from 'lucide-react';
import { BookingActions } from '@/components/BookingActions';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { MergeConfirmDialog } from '@/components/MergeConfirmDialog';
import { format, parseISO } from 'date-fns';
import type { Transportation } from '@/types/trip';

const categoryLabels: Record<string, string> = {
  flight: 'טיסה',
  train: 'רכבת',
  ferry: 'מעבורת',
  bus: 'אוטובוס',
  taxi: 'מונית',
  car_rental: 'השכרת רכב',
};

const categoryIcons: Record<string, React.ReactNode> = {
  flight: <Plane size={16} />,
  train: <Train size={16} />,
  ferry: <Ship size={16} />,
  bus: <Bus size={16} />,
  taxi: <Car size={16} />,
  car_rental: <Car size={16} />,
};

function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, HH:mm');
  } catch {
    return iso;
  }
}

const TransportPage = () => {
  const { activeTrip, sourceEmailMap } = useActiveTrip();
  const { transportation, deleteTransportation, mergeTransportation } = useTransport();
  const { itineraryDays } = useItinerary();
  const { formatCurrency, formatDualCurrency } = useFinance();
  const [selectedTransport, setSelectedTransport] = useState<Transportation | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Merge mode
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const toggleMergeSelection = (id: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { if (next.size >= 2) return prev; next.add(id); }
      return next;
    });
  };

  const selectedMergeTransports = useMemo(() => {
    if (selectedForMerge.size !== 2) return null;
    const ids = Array.from(selectedForMerge);
    const a = transportation.find(t => t.id === ids[0]);
    const b = transportation.find(t => t.id === ids[1]);
    if (!a || !b) return null;
    return [a, b] as [Transportation, Transportation];
  }, [selectedForMerge, transportation]);
  // Build a map: transportId_segmentId -> dayNumber/date
  const segmentDayMap = useMemo(() => {
    const map: Record<string, { dayNumber: number; date?: string }> = {};
    itineraryDays.forEach(day => {
      day.transportationSegments.forEach(seg => {
        const key = `${seg.transportation_id}_${seg.segment_id || ''}`;
        map[key] = { dayNumber: day.dayNumber, date: day.date };
      });
    });
    return map;
  }, [itineraryDays]);

  // Filter and sort
  const filteredTransport = useMemo(() => {
    let items = categoryFilter === 'all' ? transportation : transportation.filter(t => t.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(t =>
        t.segments.some(s =>
          s.from.name.toLowerCase().includes(q) ||
          s.to.name.toLowerCase().includes(q) ||
          (s.from.code || '').toLowerCase().includes(q) ||
          (s.to.code || '').toLowerCase().includes(q) ||
          (s.flight_or_vessel_number || '').toLowerCase().includes(q) ||
          (s.carrier_code || '').toLowerCase().includes(q)
        ) ||
        (t.booking.carrier_name || '').toLowerCase().includes(q) ||
        (t.booking.order_number || '').toLowerCase().includes(q) ||
        (t.additionalInfo.notes || '').toLowerCase().includes(q)
      );
    }
    return [...items].sort((a, b) => {
      const aDate = a.segments[0]?.departure_time || '';
      const bDate = b.segments[0]?.departure_time || '';
      return aDate.localeCompare(bDate);
    });
  }, [transportation, categoryFilter, searchQuery]);

  const categoryOptions = useMemo(() => {
    const cats = new Set(transportation.map(t => t.category));
    return Array.from(cats);
  }, [transportation]);

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Transportation</h2>
            <p className="text-muted-foreground">{filteredTransport.length} / {transportation.length} items</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={mergeMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setMergeMode(prev => !prev); setSelectedForMerge(new Set()); }}
              className="gap-1"
            >
              <Merge size={14} />
              {mergeMode ? 'בטל מיזוג' : 'מזג'}
            </Button>
            {!mergeMode && <CreateTransportForm />}
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="חפש לפי יעד, טיסה, חברה..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-8 h-9 text-sm"
          />
        </div>

        {categoryOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {categoryOptions.map(c => (
                  <SelectItem key={c} value={c}>{categoryLabels[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-4">
          {filteredTransport.map(t => (
            <div key={t.id} className="relative">
              {mergeMode && (
                <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedForMerge.has(t.id)}
                    onCheckedChange={() => toggleMergeSelection(t.id)}
                  />
                </div>
              )}
              <Card
                className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${t.isCancelled ? 'opacity-50' : ''} ${mergeMode && selectedForMerge.has(t.id) ? 'ring-2 ring-primary' : ''}`}
                onClick={() => mergeMode ? toggleMergeSelection(t.id) : setSelectedTransport(t)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {<SubCategoryIcon type={t.category} size={16} className="text-muted-foreground" />}
                      {t.segments.length > 0
                        ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}`
                        : 'Route TBD'}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">{t.category}</Badge>
                      <Badge variant={t.status === 'booked' ? 'default' : 'secondary'}>{t.status}</Badge>
                      {t.isCancelled && <Badge variant="destructive">Cancelled</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {/* Segments */}
                  {t.segments.length > 0 && (
                    <div className="space-y-2">
                      {t.segments.map((seg, i) => (
                        <div key={i} className="flex items-start gap-3 p-2 rounded bg-muted/50">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{seg.from.name}</span>
                              {seg.from.code && <span className="text-xs text-muted-foreground">({seg.from.code})</span>}
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium">{seg.to.name}</span>
                              {seg.to.code && <span className="text-xs text-muted-foreground">({seg.to.code})</span>}
                              {(() => {
                                const dayInfo = segmentDayMap[`${t.id}_${seg.segment_id || ''}`];
                                if (!dayInfo) return null;
                                return (
                                  <Badge variant="outline" className="text-xs ml-auto">
                                    יום {dayInfo.dayNumber}{dayInfo.date ? ` (${format(parseISO(dayInfo.date), 'MMM d')})` : ''}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                              <span>Depart: {formatDateTime(seg.departure_time)}</span>
                              <span>Arrive: {formatDateTime(seg.arrival_time)}</span>
                              {seg.flight_or_vessel_number && <span>Flight: {seg.flight_or_vessel_number}</span>}
                              {seg.carrier_code && <span>Carrier: {seg.carrier_code}</span>}
                              {seg.seat_info && <span>Seat: {seg.seat_info}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cost & Booking */}
                  <div className="flex flex-wrap gap-4">
                    {t.cost.total_amount > 0 && (
                      <p className="font-semibold text-primary">{formatDualCurrency(t.cost.total_amount, t.cost.currency || activeTrip?.currency || 'USD')}</p>
                    )}
                    {t.booking.carrier_name && (
                      <p className="text-xs text-muted-foreground">Carrier: {t.booking.carrier_name}</p>
                    )}
                  </div>

                  {t.booking.baggage_allowance && (
                    <div className="text-xs text-muted-foreground">
                      {t.booking.baggage_allowance.cabin_bag && <span>Cabin: {t.booking.baggage_allowance.cabin_bag} </span>}
                      {t.booking.baggage_allowance.checked_bag && <span>Checked: {t.booking.baggage_allowance.checked_bag}</span>}
                    </div>
                  )}

                  {t.additionalInfo.notes && (
                    <p className="text-xs text-muted-foreground italic">{t.additionalInfo.notes}</p>
                  )}

                  {!mergeMode && (
                    <div className="pt-1 flex justify-between items-center">
                      <BookingActions
                        orderNumber={t.booking.order_number}
                        emailLinks={t.sourceRefs.email_ids.map(id => ({ id, ...sourceEmailMap[id] }))}
                      />
                      <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={(e) => { e.stopPropagation(); deleteTransportation(t.id); }}>
                        <Trash2 size={14} className="mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}

          {filteredTransport.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {transportation.length === 0 ? 'אין פריטי תחבורה עדיין.' : 'אין תוצאות לסינון הנוכחי.'}
            </div>
          )}
        </div>

        {mergeMode && selectedForMerge.size === 2 && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
            <Button onClick={() => setMergeDialogOpen(true)} className="gap-1.5 shadow-lg">
              <Merge size={16} /> מזג פריטים נבחרים
            </Button>
          </div>
        )}

        {mergeDialogOpen && selectedMergeTransports && (
          <MergeConfirmDialog
            open={mergeDialogOpen}
            onOpenChange={(open) => {
              setMergeDialogOpen(open);
              if (!open) { setSelectedForMerge(new Set()); setMergeMode(false); }
            }}
            items={selectedMergeTransports}
            entityType="transportation"
            onConfirm={async (primaryId, secondaryId) => {
              await mergeTransportation(primaryId, secondaryId);
              setMergeDialogOpen(false);
              setSelectedForMerge(new Set());
              setMergeMode(false);
            }}
          />
        )}

        {selectedTransport && !mergeMode && (
          <TransportDetailDialog
            transport={selectedTransport}
            open={!!selectedTransport}
            onOpenChange={(open) => { if (!open) setSelectedTransport(null); }}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default TransportPage;
