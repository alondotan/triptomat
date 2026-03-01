import { useState, useMemo, useEffect } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useItinerary } from '@/context/ItineraryContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { SubCategoryIcon } from '@/components/shared/SubCategoryIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, UtensilsCrossed, Wrench, Filter, LayoutGrid, ChevronDown, ChevronRight, Search, Merge } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MergeConfirmDialog } from '@/components/MergeConfirmDialog';
import type { PointOfInterest, POIStatus, POICategory } from '@/types/trip';
import { useCountrySites, type SiteNode } from '@/hooks/useCountrySites';
import { POICard } from '@/components/poi/POICard';

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
  const { activeTrip, tripSitesHierarchy } = useActiveTrip();
  const { pois, mergePOIs } = usePOI();
  const { itineraryDays } = useItinerary();
  const [statusFilters, setStatusFilters] = useState<Set<POIStatus | 'all'>>(new Set(['all']));
  const [categoryFilters, setCategoryFilters] = useState<Set<POICategory | 'all'>>(new Set(['all']));
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Merge mode
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const toggleMergeSelection = (poi: PointOfInterest) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(poi.id)) {
        next.delete(poi.id);
      } else {
        if (next.size >= 2) return prev;
        next.add(poi.id);
      }
      return next;
    });
  };

  const selectedMergePOIs = useMemo(() => {
    if (selectedForMerge.size !== 2) return null;
    const ids = Array.from(selectedForMerge);
    const a = pois.find(p => p.id === ids[0]);
    const b = pois.find(p => p.id === ids[1]);
    if (!a || !b) return null;
    return [a, b] as [PointOfInterest, PointOfInterest];
  }, [selectedForMerge, pois]);

  // Build a map: poiId -> list of day numbers it's assigned to
  const poiDaysMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const day of itineraryDays) {
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
  }, [itineraryDays]);

  const toggleStatusFilter = (s: POIStatus | 'all') => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (s === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(s)) next.delete(s); else next.add(s);
      return next.size === 0 ? new Set(['all']) : next;
    });
  };

  const toggleCategoryFilter = (c: POICategory | 'all') => {
    setCategoryFilters(prev => {
      const next = new Set(prev);
      if (c === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(c)) next.delete(c); else next.add(c);
      return next.size === 0 ? new Set(['all']) : next;
    });
  };

  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());

  // Reset expanded state when groupBy changes (group keys change)
  useEffect(() => { setExpandedGroups(new Set()); setExpandedSubGroups(new Set()); }, [groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setExpandedSubGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const countries = activeTrip?.countries || [];
  const { sites } = useCountrySites(countries, tripSitesHierarchy as SiteNode[]);

  // Build a lookup: lowercase city name → region label (its parent in hierarchy)
  const cityRegionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sites) {
      if (s.path.length >= 2) {
        map[s.label.toLowerCase()] = s.path[s.path.length - 2];
      }
    }
    return map;
  }, [sites]);

  const nonAccommodationPois = useMemo(() => pois.filter(p => p.category !== 'accommodation'), [pois]);

  const filteredPois = useMemo(() => {
    if (!activeTrip) return [];
    let pois = statusFilters.has('all') ? nonAccommodationPois : nonAccommodationPois.filter(p => statusFilters.has(p.status));
    if (!categoryFilters.has('all')) {
      pois = pois.filter(p => categoryFilters.has(p.category));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      pois = pois.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.location.city || '').toLowerCase().includes(q) ||
        (p.location.country || '').toLowerCase().includes(q) ||
        (p.location.address || '').toLowerCase().includes(q) ||
        (p.subCategory || '').toLowerCase().includes(q) ||
        (p.details.notes?.user_summary || '').toLowerCase().includes(q)
      );
    }
    return pois;
  }, [nonAccommodationPois, statusFilters, categoryFilters, searchQuery, activeTrip]);

  const grouped = useMemo(() => {
    const groups: Record<string, PointOfInterest[]> = {};

    for (const poi of filteredPois) {
      let key: string;
      if (groupBy === 'category') {
        key = poi.category;
      } else if (groupBy === 'location') {
        const city = poi.location.city?.toLowerCase() || '';
        key = cityRegionMap[city] || poi.location.country || 'לא ידוע';
      } else {
        key = poi.status;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(poi);
    }

    // Sort keys
    const sortedEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sortedEntries;
  }, [filteredPois, groupBy, cityRegionMap]);

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

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of nonAccommodationPois) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, [nonAccommodationPois]);

  if (!activeTrip) {
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

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="חפש לפי שם, מיקום, קטגוריה..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-8 h-9 text-sm"
          />
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

          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-wrap">
              <Badge
                variant={categoryFilters.has('all') ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => toggleCategoryFilter('all')}
              >
                הכל
              </Badge>
              {(['attraction', 'eatery', 'service'] as POICategory[]).map(c => (
                categoryCounts[c] ? (
                  <Badge
                    key={c}
                    variant={categoryFilters.has(c) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs gap-1"
                    onClick={() => toggleCategoryFilter(c)}
                  >
                    {categoryIcons[c]}
                    {categoryLabels[c]} ({categoryCounts[c]})
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

          // Build sub-groups: by subCategory for category mode, by city for location mode
          const subGroups: [string, PointOfInterest[]][] = (groupBy === 'category' || groupBy === 'location')
            ? (() => {
                const map: Record<string, PointOfInterest[]> = {};
                for (const poi of pois) {
                  const sub = groupBy === 'category'
                    ? (poi.subCategory || '—')
                    : (poi.location.city || poi.location.country || '—');
                  if (!map[sub]) map[sub] = [];
                  map[sub].push(poi);
                }
                return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
              })()
            : [];


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
              (groupBy === 'category' || groupBy === 'location') ? (
                <div className="space-y-1 mb-4 ml-5">
                  {subGroups.map(([subKey, subPois]) => {
                    const subGroupKey = `${key}::${subKey}`;
                    const isSubExpanded = expandedSubGroups.has(subGroupKey);
                    return (
                      <div key={subKey}>
                        <button
                          onClick={() => toggleSubGroup(subGroupKey)}
                          className="w-full text-left mb-2 flex items-center gap-2 hover:text-primary transition-colors group"
                        >
                          {isSubExpanded
                            ? <ChevronDown size={13} className="text-muted-foreground group-hover:text-primary transition-colors" />
                            : <ChevronRight size={13} className="text-muted-foreground group-hover:text-primary transition-colors" />
                          }
                          {groupBy === 'category'
                            ? <SubCategoryIcon type={subKey} size={13} />
                            : <MapPin size={13} className="text-muted-foreground shrink-0" />
                          }
                          <span className="text-sm font-medium">{subKey}</span>
                          <Badge variant="outline" className="text-[10px] ml-1">{subPois.length}</Badge>
                        </button>
                        {isSubExpanded && (
                          <div className="grid gap-3 md:grid-cols-2 mb-3 ml-4">
                            {subPois.map(p => (
                              <div key={p.id} className="relative">
                                {mergeMode && (
                                  <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedForMerge.has(p.id)}
                                      onCheckedChange={() => toggleMergeSelection(p)}
                                    />
                                  </div>
                                )}
                                <div className={mergeMode && selectedForMerge.has(p.id) ? 'ring-2 ring-primary rounded-lg' : ''}>
                                  <POICard poi={p} level={3} editable={!mergeMode} showSubCategory={false} poiDaysMap={poiDaysMap} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 mb-2">
                  {pois.map(p => (
                    <div key={p.id} className="relative">
                      {mergeMode && (
                        <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedForMerge.has(p.id)}
                            onCheckedChange={() => toggleMergeSelection(p)}
                          />
                        </div>
                      )}
                      <div className={mergeMode && selectedForMerge.has(p.id) ? 'ring-2 ring-primary rounded-lg' : ''}>
                        <POICard poi={p} level={3} editable={!mergeMode} showSubCategory poiDaysMap={poiDaysMap} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
          );
        })}

        {filteredPois.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {nonAccommodationPois.length === 0 ? 'אין נקודות עניין עדיין. הוסף אחת כדי להתחיל!' : 'אין תוצאות לפילטר הנוכחי.'}
          </div>
        )}

        {mergeMode && selectedForMerge.size === 2 && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
            <Button onClick={() => setMergeDialogOpen(true)} className="gap-1.5 shadow-lg">
              <Merge size={16} /> מזג פריטים נבחרים
            </Button>
          </div>
        )}

        {mergeDialogOpen && selectedMergePOIs && (
          <MergeConfirmDialog
            open={mergeDialogOpen}
            onOpenChange={(open) => {
              setMergeDialogOpen(open);
              if (!open) { setSelectedForMerge(new Set()); setMergeMode(false); }
            }}
            items={selectedMergePOIs}
            entityType="poi"
            onConfirm={async (primaryId, secondaryId) => {
              await mergePOIs(primaryId, secondaryId);
              setMergeDialogOpen(false);
              setSelectedForMerge(new Set());
              setMergeMode(false);
            }}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default POIsPage;
