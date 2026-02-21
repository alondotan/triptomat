import { useState, useMemo } from 'react';
import { useTrip } from '@/context/TripContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateTransportForm } from '@/components/forms/CreateTransportForm';
import { TransportDetailDialog } from '@/components/TransportDetailDialog';
import { Plane, Train, Ship, Bus, Car, Trash2, Filter } from 'lucide-react';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
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
  const { state, formatCurrency, formatDualCurrency, deleteTransportation } = useTrip();
  const [selectedTransport, setSelectedTransport] = useState<Transportation | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // Build a map: transportId_segmentId -> dayNumber/date
  const segmentDayMap = useMemo(() => {
    const map: Record<string, { dayNumber: number; date?: string }> = {};
    state.itineraryDays.forEach(day => {
      day.transportationSegments.forEach(seg => {
        const key = `${seg.transportation_id}_${seg.segment_id || ''}`;
        map[key] = { dayNumber: day.dayNumber, date: day.date };
      });
    });
    return map;
  }, [state.itineraryDays]);

  // Filter and sort
  const filteredTransport = useMemo(() => {
    let items = categoryFilter === 'all' ? state.transportation : state.transportation.filter(t => t.category === categoryFilter);
    // Sort by earliest departure date
    return [...items].sort((a, b) => {
      const aDate = a.segments[0]?.departure_time || '';
      const bDate = b.segments[0]?.departure_time || '';
      return aDate.localeCompare(bDate);
    });
  }, [state.transportation, categoryFilter]);

  const categoryOptions = useMemo(() => {
    const cats = new Set(state.transportation.map(t => t.category));
    return Array.from(cats);
  }, [state.transportation]);

  if (!state.activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Transportation</h2>
            <p className="text-muted-foreground">{filteredTransport.length} / {state.transportation.length} items</p>
          </div>
          <CreateTransportForm />
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
            <Card key={t.id} className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${t.isCancelled ? 'opacity-50' : ''}`} onClick={() => setSelectedTransport(t)}>
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
                    <p className="font-semibold text-primary">{formatDualCurrency(t.cost.total_amount, t.cost.currency || state.activeTrip?.currency || 'USD')}</p>
                  )}
                  {t.booking.order_number && (
                    <p className="text-xs text-muted-foreground">Order: {t.booking.order_number}</p>
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

                <div className="pt-1 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={(e) => { e.stopPropagation(); deleteTransportation(t.id); }}>
                    <Trash2 size={14} className="mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredTransport.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {state.transportation.length === 0 ? 'אין פריטי תחבורה עדיין.' : 'אין תוצאות לסינון הנוכחי.'}
            </div>
          )}
        </div>

        {selectedTransport && (
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
