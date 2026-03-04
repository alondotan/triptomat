import { useState, useMemo } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useFinance } from '@/context/FinanceContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { POIDetailDialog } from '@/components/poi/POIDetailDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, CalendarDays, BedDouble, Trash2, ArrowRight, Search, Clock, Merge } from 'lucide-react';
import { BookingActions } from '@/components/BookingActions';
import { Checkbox } from '@/components/ui/checkbox';
import { MergeConfirmDialog } from '@/components/MergeConfirmDialog';
import type { PointOfInterest } from '@/types/trip';

const statusLabels: Record<string, string> = {
  suggested: 'מוצע',
  interested: 'מעניין',
  planned: 'מתוכנן',
  scheduled: 'בלו״ז',
  booked: 'הוזמן',
  visited: 'בוקר',
  skipped: 'דילגתי',
};

const AccommodationPage = () => {
  const { activeTrip, sourceEmailMap } = useActiveTrip();
  const { pois, deletePOI, mergePOIs } = usePOI();
  const { formatDualCurrency } = useFinance();
  const [selectedPOI, setSelectedPOI] = useState<PointOfInterest | null>(null);
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

  const selectedMergeAccomm = useMemo(() => {
    if (selectedForMerge.size !== 2) return null;
    const ids = Array.from(selectedForMerge);
    const a = pois.find(p => p.id === ids[0]);
    const b = pois.find(p => p.id === ids[1]);
    if (!a || !b) return null;
    return [a, b] as [PointOfInterest, PointOfInterest];
  }, [selectedForMerge, pois]);

  const accommodations = useMemo(() => {
    if (!activeTrip) return [];
    let list = pois
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
  }, [pois, activeTrip, searchQuery]);

  if (!activeTrip) {
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
            {!mergeMode && <CreatePOIForm />}
          </div>
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
            {pois.filter(p => p.category === 'accommodation').length === 0
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
                <div key={poi.id} className="relative">
                  {mergeMode && (
                    <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedForMerge.has(poi.id)}
                        onCheckedChange={() => toggleMergeSelection(poi.id)}
                      />
                    </div>
                  )}
                <Card
                  className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${poi.isCancelled ? 'opacity-50' : ''} ${mergeMode && selectedForMerge.has(poi.id) ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => mergeMode ? toggleMergeSelection(poi.id) : setSelectedPOI(poi)}
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
                          {formatDualCurrency(poi.details.cost.amount, poi.details.cost.currency || activeTrip?.currency || 'USD')}
                        </span>
                        {acc?.price_per_night && (
                          <span className="text-xs text-muted-foreground">
                            ({formatDualCurrency(acc.price_per_night, poi.details.cost.currency || 'USD')} / לילה)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Free cancellation deadline */}
                    {acc?.free_cancellation_until && (() => {
                      const deadline = new Date(acc.free_cancellation_until);
                      const isPast = deadline < new Date();
                      const dateStr = deadline.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
                      const timeStr = deadline.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1 w-fit ${isPast ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                          <Clock size={12} />
                          <span>ביטול חינם עד {dateStr} {timeStr}</span>
                        </div>
                      );
                    })()}

                    {/* Notes */}
                    {poi.details.notes?.user_summary && (
                      <p className="text-xs text-muted-foreground italic">{poi.details.notes.user_summary}</p>
                    )}

                    {!mergeMode && (
                      <div className="pt-1 flex justify-between items-center">
                        <BookingActions
                          orderNumber={poi.details.order_number}
                          emailLinks={poi.sourceRefs.email_ids.map(id => ({ id, ...sourceEmailMap[id] }))}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive h-7"
                          onClick={(e) => { e.stopPropagation(); deletePOI(poi.id); }}
                        >
                          <Trash2 size={14} className="mr-1" /> מחק
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                </div>
              );
            })}
          </div>
        )}

        {mergeMode && selectedForMerge.size === 2 && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
            <Button onClick={() => setMergeDialogOpen(true)} className="gap-1.5 shadow-lg">
              <Merge size={16} /> מזג מלונות נבחרים
            </Button>
          </div>
        )}

        {mergeDialogOpen && selectedMergeAccomm && (
          <MergeConfirmDialog
            open={mergeDialogOpen}
            onOpenChange={(open) => {
              setMergeDialogOpen(open);
              if (!open) { setSelectedForMerge(new Set()); setMergeMode(false); }
            }}
            items={selectedMergeAccomm}
            entityType="poi"
            onConfirm={async (primaryId, secondaryId) => {
              await mergePOIs(primaryId, secondaryId);
              setMergeDialogOpen(false);
              setSelectedForMerge(new Set());
              setMergeMode(false);
            }}
          />
        )}

        {selectedPOI && !mergeMode && (
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
