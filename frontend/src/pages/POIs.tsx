import { useState, useMemo } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { MapPin, Filter, LayoutGrid, Search, Merge, ChevronLeft, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MergeConfirmDialog } from '@/components/MergeConfirmDialog';
import type { PointOfInterest, POIStatus, POICategory } from '@/types/trip';
import { flattenTripLocations } from '@/services/tripLocationService';
import { POICard } from '@/components/poi/POICard';
import { getCategoryIcon, getCategoryLabel, getPOICategories } from '@/lib/subCategoryConfig';

const statusLabels: Record<string, string> = {
  suggested: 'מוצע',
  interested: 'מעניין',
  planned: 'מתוכנן',
  scheduled: 'בלו״ז',
  booked: 'הוזמן',
  visited: 'בוקר',
  skipped: 'דילגתי',
};

type GroupBy = 'category' | 'location' | 'status';
type SortBy = 'name' | 'updated_at' | 'created_at';

const POIsPage = () => {
  const navigate = useNavigate();
  const { activeTrip, tripLocations } = useActiveTrip();
  const { pois, mergePOIs } = usePOI();
  const [statusFilters, setStatusFilters] = useState<Set<POIStatus | 'all'>>(new Set(['all']));
  const [categoryFilters, setCategoryFilters] = useState<Set<POICategory | 'all'>>(new Set(['all']));
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

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


  const sites = useMemo(() => flattenTripLocations(tripLocations), [tripLocations]);

  // Build a lookup: lowercase site name → city-level ancestor (path[1], first child under country)
  // e.g. "panglao" → "Bohol", "bohol" → "Bohol", "hidden beach" → "El Nido"
  const cityRegionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sites) {
      if (s.path.length >= 2) {
        map[s.label.toLowerCase()] = s.path[1];
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
    // First pass: group by primary key
    const primaryGroups: Record<string, PointOfInterest[]> = {};

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
      if (!primaryGroups[key]) primaryGroups[key] = [];
      primaryGroups[key].push(poi);
    }

    // Second pass: split sub-groups with >6 items into separate rows
    const result: [string, PointOfInterest[]][] = [];
    const SUB_GROUP_THRESHOLD = 6;

    for (const [key, pois] of Object.entries(primaryGroups)) {
      if (groupBy === 'category' || groupBy === 'location') {
        // Build sub-groups
        const subMap: Record<string, PointOfInterest[]> = {};
        for (const poi of pois) {
          const sub = groupBy === 'category'
            ? (poi.subCategory || '—')
            : (poi.location.city || poi.location.country || '—');
          if (!subMap[sub]) subMap[sub] = [];
          subMap[sub].push(poi);
        }

        const largeSubs = Object.entries(subMap).filter(([, items]) => items.length > SUB_GROUP_THRESHOLD);

        if (largeSubs.length > 0) {
          // Collect remaining items (sub-groups with <= threshold)
          const remaining: PointOfInterest[] = [];
          for (const [sub, items] of Object.entries(subMap)) {
            if (items.length > SUB_GROUP_THRESHOLD) {
              result.push([`${key}::${sub}`, items]);
            } else {
              remaining.push(...items);
            }
          }
          if (remaining.length > 0) {
            result.push([`${key}::כללי`, remaining]);
          }
        } else {
          result.push([key, pois]);
        }
      } else {
        result.push([key, pois]);
      }
    }

    // Sort keys
    result.sort(([a], [b]) => a.localeCompare(b));

    // Sort items within each group
    if (sortBy === 'updated_at') {
      for (const [, items] of result) {
        items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }
    } else if (sortBy === 'created_at') {
      for (const [, items] of result) {
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } else {
      for (const [, items] of result) {
        items.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return result;
  }, [filteredPois, groupBy, cityRegionMap, sortBy]);

  const getGroupLabel = (key: string): string => {
    // Handle split sub-group keys like "category::subName"
    const [primary, sub] = key.split('::');
    const baseLabel = groupBy === 'category' ? getCategoryLabel(primary)
      : groupBy === 'status' ? (statusLabels[primary] || primary)
      : primary;
    return sub ? `${baseLabel} | ${sub}` : baseLabel;
  };

  const getGroupIcon = (key: string): React.ReactNode => {
    const primary = key.split('::')[0];
    if (groupBy === 'category') { const Icon = getCategoryIcon(primary); return <Icon size={16} />; }
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
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(prev => !prev)}
              className="gap-1.5 text-xs"
            >
              <Filter size={14} />
              סינון
              {(!statusFilters.has('all') || !categoryFilters.has('all')) && (
                <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                  {(statusFilters.has('all') ? 0 : statusFilters.size) + (categoryFilters.has('all') ? 0 : categoryFilters.size)}
                </span>
              )}
              {filtersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </Button>

            <div className="flex items-center gap-3 mr-auto">
              <div className="flex items-center gap-1">
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
              <div className="flex items-center gap-1">
                <ArrowUpDown size={14} className="text-muted-foreground" />
                <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">לפי שם</SelectItem>
                    <SelectItem value="updated_at">לפי עדכון</SelectItem>
                    <SelectItem value="created_at">לפי יצירה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div className="flex flex-wrap gap-3 items-center border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">סטטוס:</span>
                <div className="flex gap-1 flex-wrap">
                  <Badge
                    variant={statusFilters.has('all') ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleStatusFilter('all')}
                  >
                    הכל ({statusCounts.all || 0})
                  </Badge>
                  {(['suggested', 'interested', 'planned', 'scheduled', 'booked', 'visited', 'skipped'] as POIStatus[]).map(s => (
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
                <span className="text-xs text-muted-foreground font-medium">קטגוריה:</span>
                <div className="flex gap-1 flex-wrap">
                  <Badge
                    variant={categoryFilters.has('all') ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleCategoryFilter('all')}
                  >
                    הכל
                  </Badge>
                  {getPOICategories().filter(c => c !== 'accommodation').map(c => {
                    const Icon = getCategoryIcon(c);
                    return categoryCounts[c] ? (
                      <Badge
                        key={c}
                        variant={categoryFilters.has(c as POICategory) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs gap-1"
                        onClick={() => toggleCategoryFilter(c as POICategory)}
                      >
                        <Icon size={16} />
                        {getCategoryLabel(c)} ({categoryCounts[c]})
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {grouped.map(([key, pois]) => (
          <div key={key} className="space-y-2">
            <button
              onClick={() => navigate(`/pois/group?groupBy=${groupBy}&key=${encodeURIComponent(key)}`)}
              className="flex items-center gap-2 hover:text-primary transition-colors group/header"
            >
              {getGroupIcon(key)}
              <span className="text-lg font-semibold">{getGroupLabel(key)}</span>
              <Badge variant="secondary" className="text-xs ml-1">{pois.length}</Badge>
              <ChevronLeft size={16} className="text-muted-foreground group-hover/header:text-primary transition-colors" />
            </button>
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-3">
                {pois.map(p => (
                  <div key={p.id} className="w-36 shrink-0 relative">
                    {mergeMode && (
                      <div className="absolute top-1.5 left-1.5 z-10" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedForMerge.has(p.id)}
                          onCheckedChange={() => toggleMergeSelection(p)}
                        />
                      </div>
                    )}
                    <div className={mergeMode && selectedForMerge.has(p.id) ? 'ring-2 ring-primary rounded-lg' : ''}>
                      <POICard poi={p} level={3} />
                    </div>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        ))}

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
