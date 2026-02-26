import { useState, useMemo } from 'react';
import { useTrip } from '@/context/TripContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { POIDetailDialog } from '@/components/POIDetailDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, CalendarDays, BedDouble, Trash2, ArrowRight, Search } from 'lucide-react';
import type { PointOfInterest } from '@/types/trip';

const statusLabels: Record<string, string> = {
  candidate: 'מועמד',
  in_plan: 'בתוכנית',
  matched: 'משודך',
  booked: 'הוזמן',
  visited: 'בוקר',
};

const AccommodationPage = () => {
  const { state, formatDualCurrency, deletePOI } = useTrip();
  const [selectedPOI, setSelectedPOI] = useState<PointOfInterest | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const accommodations = useMemo(() => {
    if (!state.activeTrip) return [];
    let list = state.pois
      .filter(p => p.category === 'accommodation')
      .sort((a, b) => {
        const dateA = a.details.accommodation_details?.checkin?.date || '';
        const dateB = b.details.accommodation_details?.checkin?.date || '';
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      });
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.location.city || '').toLowerCase().includes(q) ||
        (p.location.country || '').toLowerCase().includes(q) ||
        (p.details.notes?.user_summary || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [state.pois, state.activeTrip, searchQuery]);

  if (!state.activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Accommodation</h2>
            <p className="text-muted-foreground">{accommodations.length} stays</p>
          </div>
          <CreatePOIForm />
        </div>

        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="חפש לפי שם, עיר, מדינה..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-8 h-9 text-sm"
          />
        </div>

        {accommodations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {state.pois.filter(p => p.category === 'accommodation').length === 0
              ? 'No accommodation added yet. Forward a booking confirmation email or add one manually.'
              : 'אין תוצאות לחיפוש הנוכחי.'}
          </div>
        ) : (
          <div className="space-y-4">
            {accommodations.map(poi => {
              const acc = poi.details.accommodation_details;
              const nights = (() => {
                if (!acc?.checkin?.date || !acc?.checkout?.date) return null;
                const d1 = new Date(acc.checkin.date);
                const d2 = new Date(acc.checkout.date);
                const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
                return diff > 0 ? diff : null;
              })();

              return (
                <Card
                  key={poi.id}
                  className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${poi.isCancelled ? 'opacity-50' : ''}`}
                  onClick={() => setSelectedPOI(poi)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <CardTitle className="text-base">{poi.name}</CardTitle>
                          {(poi.location.city || poi.location.country) && (
                            <p className="text-xs text-muted-foreground">
                              📍 {[poi.location.city, poi.location.country].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={poi.status === 'booked' ? 'default' : 'secondary'} className="text-xs">
                          {statusLabels[poi.status] || poi.status}
                        </Badge>
                        {poi.isCancelled && <Badge variant="destructive">בוטל</Badge>}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 text-sm">
                    {/* Check-in / Check-out row */}
                    {acc && (acc.checkin?.date || acc.checkout?.date) && (
                      <div className="flex items-center gap-3 flex-wrap">
                        {acc.checkin?.date && (
                          <div className="flex items-center gap-1.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded-md px-2 py-1">
                            <CalendarDays size={13} />
                            <span className="font-medium">{acc.checkin.date}</span>
                            {acc.checkin.hour && <span className="text-xs opacity-75">{acc.checkin.hour}</span>}
                          </div>
                        )}
                        {acc.checkin?.date && acc.checkout?.date && (
                          <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                        )}
                        {acc.checkout?.date && (
                          <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md px-2 py-1">
                            <CalendarDays size={13} />
                            <span className="font-medium">{acc.checkout.date}</span>
                            {acc.checkout.hour && <span className="text-xs opacity-75">{acc.checkout.hour}</span>}
                          </div>
                        )}
                        {nights !== null && (
                          <span className="text-xs text-muted-foreground">{nights} {nights === 1 ? 'לילה' : 'לילות'}</span>
                        )}
                      </div>
                    )}

                    {/* Room info */}
                    {acc?.rooms && acc.rooms.length > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <BedDouble size={14} />
                        <span>{acc.rooms.map(r => [r.room_type, r.occupancy].filter(Boolean).join(' · ')).join(', ')}</span>
                      </div>
                    )}

                    {/* Cost */}
                    {poi.details.cost && poi.details.cost.amount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary">
                          {formatDualCurrency(poi.details.cost.amount, poi.details.cost.currency || state.activeTrip?.currency || 'USD')}
                        </span>
                        {acc?.price_per_night && (
                          <span className="text-xs text-muted-foreground">
                            ({formatDualCurrency(acc.price_per_night, poi.details.cost.currency || 'USD')} / לילה)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {poi.details.notes?.user_summary && (
                      <p className="text-xs text-muted-foreground italic">{poi.details.notes.user_summary}</p>
                    )}

                    <div className="pt-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-7"
                        onClick={(e) => { e.stopPropagation(); deletePOI(poi.id); }}
                      >
                        <Trash2 size={14} className="mr-1" /> מחק
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {selectedPOI && (
          <POIDetailDialog
            poi={selectedPOI}
            open={!!selectedPOI}
            onOpenChange={(open) => { if (!open) setSelectedPOI(null); }}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default AccommodationPage;
