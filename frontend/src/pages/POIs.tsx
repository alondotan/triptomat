import { useState, useMemo, useEffect } from 'react';
import { useTrip } from '@/context/TripContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { POIDetailDialog } from '@/components/POIDetailDialog';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, UtensilsCrossed, Wrench, Trash2, Filter, LayoutGrid, CalendarDays, Heart, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PointOfInterest, POIStatus } from '@/types/trip';

const categoryIcons: Record<string, React.ReactNode> = {
  attraction: <MapPin size={16} />,
  eatery: <UtensilsCrossed size={16} />,
  service: <Wrench size={16} />,
};

const categoryLabels: Record<string, string> = {
  eatery: 'אוכל',
  attraction: 'אטרקציות',
  service: 'שירותים',
};

const statusLabels: Record<string, string> = {
  candidate: 'מועמד',
  in_plan: 'בתוכנית',
  matched: 'משודך',
  booked: 'הוזמן',
  visited: 'בוקר',
};

type GroupBy = 'category' | 'location' | 'status';

const POIsPage = () => {
  const { state, formatDualCurrency, deletePOI, updatePOI } = useTrip();
  const [selectedPOI, setSelectedPOI] = useState<PointOfInterest | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<POIStatus | 'all'>>(new Set(['all']));
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Build a map: poiId -> list of day numbers it's assigned to
  const poiDaysMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const day of state.itineraryDays) {
      const poiIds: string[] = [];
      for (const opt of day.accommodationOptions || []) poiIds.push(opt.poi_id);
      for (const act of day.activities || []) if (act.type === 'poi') poiIds.push(act.id);
      for (const id of poiIds) {
        if (!map[id]) map[id] = [];
        map[id].push(day.dayNumber);
      }
    }
    // Sort day numbers
    for (const id of Object.keys(map)) map[id].sort((a, b) => a - b);
    return map;
  }, [state.itineraryDays]);

  const toggleStatusFilter = (s: POIStatus | 'all') => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (s === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(s)) next.delete(s); else next.add(s);
      return next.size === 0 ? new Set(['all']) : next;
    });
  };

  const toggleLike = async (poi: PointOfInterest, e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't allow toggling like if already matched/booked/visited
    if (poi.status === 'matched' || poi.status === 'booked' || poi.status === 'visited') return;
    const newStatus: POIStatus = poi.status === 'in_plan' ? 'candidate' : 'in_plan';
    await updatePOI({ ...poi, status: newStatus });
  };

  // Reset expanded state when groupBy changes (group keys change)
  useEffect(() => { setExpandedGroups(new Set()); }, [groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const nonAccommodationPois = useMemo(() => state.pois.filter(p => p.category !== 'accommodation'), [state.pois]);

  const filteredPois = useMemo(() => {
    if (!state.activeTrip) return [];
    if (statusFilters.has('all')) return nonAccommodationPois;
    return nonAccommodationPois.filter(p => statusFilters.has(p.status));
  }, [nonAccommodationPois, statusFilters, state.activeTrip]);

  const grouped = useMemo(() => {
    const groups: Record<string, PointOfInterest[]> = {};

    for (const poi of filteredPois) {
      let key: string;
      if (groupBy === 'category') {
        key = poi.category;
      } else if (groupBy === 'location') {
        key = poi.location.city || poi.location.country || 'לא ידוע';
      } else {
        key = poi.status;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(poi);
    }

    // Sort keys
    const sortedEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sortedEntries;
  }, [filteredPois, groupBy]);

  const getGroupLabel = (key: string): string => {
    if (groupBy === 'category') return categoryLabels[key] || key;
    if (groupBy === 'status') return statusLabels[key] || key;
    return key; // location - already readable
  };

  const getGroupIcon = (key: string): React.ReactNode => {
    if (groupBy === 'category') return categoryIcons[key] || <MapPin size={16} />;
    if (groupBy === 'location') return <MapPin size={16} />;
    return null;
  };

  // Status counts for filter badges (excluding accommodation)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: nonAccommodationPois.length };
    for (const p of nonAccommodationPois) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return counts;
  }, [nonAccommodationPois]);

  if (!state.activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Points of Interest</h2>
            <p className="text-muted-foreground">{filteredPois.length} / {nonAccommodationPois.length} items</p>
          </div>
          <CreatePOIForm />
        </div>

        {/* Filter & Group Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <div className="flex gap-1 flex-wrap">
              <Badge
                variant={statusFilters.has('all') ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => toggleStatusFilter('all')}
              >
                הכל ({statusCounts.all || 0})
              </Badge>
              {(['candidate', 'in_plan', 'matched', 'booked', 'visited'] as POIStatus[]).map(s => (
                statusCounts[s] ? (
                  <Badge
                    key={s}
                    variant={statusFilters.has(s) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleStatusFilter(s)}
                  >
                    {statusLabels[s]} ({statusCounts[s]})
                  </Badge>
                ) : null
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 mr-auto">
            <LayoutGrid size={14} className="text-muted-foreground" />
            <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category">לפי קטגוריה</SelectItem>
                <SelectItem value="location">לפי מיקום</SelectItem>
                <SelectItem value="status">לפי סטטוס</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {grouped.map(([key, pois]) => {
          const isExpanded = expandedGroups.has(key);
          return (
          <div key={key}>
            <button
              onClick={() => toggleGroup(key)}
              className="w-full text-left mb-3 flex items-center gap-2 hover:text-primary transition-colors group"
            >
              {isExpanded
                ? <ChevronDown size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                : <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
              }
              {getGroupIcon(key)}
              <span className="text-lg font-semibold">{getGroupLabel(key)}</span>
              <Badge variant="secondary" className="text-xs ml-1">{pois.length}</Badge>
            </button>
            {isExpanded && (
            <div className="grid gap-3 md:grid-cols-2 mb-2">
              {pois.map(poi => (
                <Card key={poi.id} className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${poi.isCancelled ? 'opacity-50' : ''}`} onClick={() => setSelectedPOI(poi)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => toggleLike(poi, e)}
                          className={`shrink-0 transition-colors ${
                            poi.status === 'in_plan' || poi.status === 'matched' ? 'text-red-500' : 
                            poi.status === 'booked' || poi.status === 'visited' ? 'text-muted-foreground/30 cursor-default' :
                            'text-muted-foreground/40 hover:text-red-400'
                          }`}
                          title={poi.status === 'matched' ? 'משודך ליום' : poi.status === 'in_plan' ? 'הסר מהתוכנית' : 'הוסף לתוכנית'}
                        >
                          <Heart size={16} fill={poi.status === 'in_plan' || poi.status === 'matched' ? 'currentColor' : 'none'} />
                        </button>
                        <CardTitle className="text-base">{poi.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={poi.status === 'booked' ? 'default' : 'secondary'} className="text-xs">{statusLabels[poi.status] || poi.status}</Badge>
                        {poi.isCancelled && <Badge variant="destructive">בוטל</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {poi.subCategory && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <SubCategoryIcon type={poi.subCategory} size={12} />
                        {poi.subCategory}
                      </Badge>
                    )}

                    {(poi.location.city || poi.location.country || poi.location.address) && (
                      <p className="text-muted-foreground">
                        📍 {[poi.location.address, poi.location.city, poi.location.country].filter(Boolean).join(', ')}
                      </p>
                    )}

                    {poi.details.cost && poi.details.cost.amount > 0 && (
                      <p className="font-semibold text-primary">
                        {formatDualCurrency(poi.details.cost.amount, poi.details.cost.currency || state.activeTrip?.currency || 'USD')}
                      </p>
                    )}

                    {poi.details.accommodation_details && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {poi.details.accommodation_details.checkin?.date && (
                          <p>Check-in: {poi.details.accommodation_details.checkin.date} {poi.details.accommodation_details.checkin.hour || ''}</p>
                        )}
                        {poi.details.accommodation_details.checkout?.date && (
                          <p>Check-out: {poi.details.accommodation_details.checkout.date} {poi.details.accommodation_details.checkout.hour || ''}</p>
                        )}
                      </div>
                    )}

                    {poi.details.notes?.user_summary && (
                      <p className="text-xs text-muted-foreground italic">{poi.details.notes.user_summary}</p>
                    )}

                    {poiDaysMap[poi.id] && poiDaysMap[poi.id].length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <CalendarDays size={12} className="text-muted-foreground" />
                        {poiDaysMap[poi.id].map(d => (
                          <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">יום {d}</Badge>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 flex justify-end">
                      <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={(e) => { e.stopPropagation(); deletePOI(poi.id); }}>
                        <Trash2 size={14} className="mr-1" /> מחק
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            )}
          </div>
          );
        })}

        {filteredPois.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {nonAccommodationPois.length === 0 ? 'אין נקודות עניין עדיין. הוסף אחת כדי להתחיל!' : 'אין תוצאות לפילטר הנוכחי.'}
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

export default POIsPage;
