import { useMemo } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useItinerary } from '@/context/ItineraryContext';
import { usePOI } from '@/context/POIContext';
import { useTransport } from '@/context/TransportContext';
import { useFinance } from '@/context/FinanceContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/AppLayout';
import { Building2, MapPin, Plane, CalendarDays } from 'lucide-react';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { format, eachDayOfInterval, parseISO } from 'date-fns';

const ItineraryPage = () => {
  const { activeTrip } = useActiveTrip();
  const { itineraryDays } = useItinerary();
  const { pois } = usePOI();
  const { transportation } = useTransport();
  const { formatCurrency } = useFinance();

  const tripDays = useMemo(() => {
    if (!activeTrip) return [];
    return eachDayOfInterval({
      start: parseISO(activeTrip.startDate),
      end: parseISO(activeTrip.endDate),
    });
  }, [activeTrip?.startDate, activeTrip?.endDate]);

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays size={24} /> סיכום מסלול
          </h2>
          <p className="text-muted-foreground">
            {activeTrip.name} • {format(parseISO(activeTrip.startDate), 'MMM d')} – {format(parseISO(activeTrip.endDate), 'MMM d, yyyy')}
          </p>
        </div>

        <div className="space-y-3">
          {tripDays.map((day, idx) => {
            const dayNum = idx + 1;
            const itDay = itineraryDays.find(d => d.dayNumber === dayNum);

            // Resolve linked entities
            const accommodations = (itDay?.accommodationOptions || [])
              .map(opt => pois.find(p => p.id === opt.poi_id))
              .filter(Boolean);

            const activities = (itDay?.activities || [])
              .filter(a => a.type === 'poi')
              .sort((a, b) => a.order - b.order)
              .map(a => pois.find(p => p.id === a.id))
              .filter(Boolean);

            const transports = (itDay?.transportationSegments || [])
              .map(seg => transportation.find(t => t.id === seg.transportation_id))
              .filter(Boolean);

            const hasContent = accommodations.length > 0 || activities.length > 0 || transports.length > 0;

            return (
              <Card key={dayNum} className={hasContent ? 'border-primary/20' : 'border-border/50'}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0 ${
                      hasContent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {dayNum}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{format(day, 'EEEE, MMM d')}</span>
                        {itDay?.locationContext && (
                          <Badge variant="outline" className="text-xs">📍 {itDay.locationContext}</Badge>
                        )}
                      </div>

                      {!hasContent && (
                        <p className="text-xs text-muted-foreground">יום חופשי</p>
                      )}

                      <div className="space-y-1">
                        {transports.map(t => (
                          <div key={t!.id} className="flex items-center gap-2 text-sm">
                            <Plane size={13} className="text-primary shrink-0" />
                            <span className="truncate">
                              {t!.segments.length > 0
                                ? `${t!.segments[0].from.name} → ${t!.segments[t!.segments.length - 1].to.name}`
                                : t!.category}
                            </span>
                            <Badge variant={t!.status === 'booked' ? 'default' : 'secondary'} className="text-[10px] shrink-0">{t!.status}</Badge>
                          </div>
                        ))}

                        {activities.map(poi => (
                          <div key={poi!.id} className="flex items-center gap-2 text-sm">
                            {poi!.subCategory ? <SubCategoryIcon type={poi!.subCategory} size={13} className="text-primary shrink-0" /> : <MapPin size={13} className="text-primary shrink-0" />}
                            <span className="truncate">{poi!.name}</span>
                            {poi!.subCategory && <span className="text-xs text-muted-foreground">({poi!.subCategory})</span>}
                            <Badge variant={poi!.status === 'booked' ? 'default' : 'secondary'} className="text-[10px] shrink-0">{poi!.status}</Badge>
                          </div>
                        ))}

                        {accommodations.map(poi => (
                          <div key={poi!.id} className="flex items-center gap-2 text-sm">
                            <Building2 size={13} className="text-primary shrink-0" />
                            <span className="truncate">{poi!.name}</span>
                            <Badge variant={poi!.status === 'booked' ? 'default' : 'secondary'} className="text-[10px] shrink-0">{poi!.status}</Badge>
                            {poi!.details.cost && poi!.details.cost.amount > 0 && (
                              <span className="text-xs text-primary font-medium">{formatCurrency(poi!.details.cost.amount, poi!.details.cost.currency)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default ItineraryPage;
