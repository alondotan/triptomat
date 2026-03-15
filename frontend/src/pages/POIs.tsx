import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, LayoutGrid, Search, Merge, ChevronLeft, ChevronDown, ChevronUp, ArrowUpDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MergeConfirmDialog } from '@/components/MergeConfirmDialog';
import type { PointOfInterest, POIStatus, POICategory } from '@/types/trip';
import { flattenTripLocations } from '@/services/tripLocationService';
import { POICard } from '@/components/poi/POICard';
import { getCategoryIcon, getCategoryLabel, getSubCategoryLabel, getCategoryGroupLabel, getSubCategoryGroup, getPOICategories } from '@/lib/subCategoryConfig';

type GroupBy = 'category' | 'location' | 'status';
type SortBy = 'name' | 'updated_at' | 'created_at';

const POIsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeTrip, tripLocations } = useActiveTrip();
  const { pois, mergePOIs } = usePOI();
  const [statusFilters, setStatusFilters] = useState<Set<POIStatus | 'all'>>(new Set(['all']));
  const [categoryFilters, setCategoryFilters] = useState<Set<POICategory | 'all'>>(new Set(['all']));
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showNewOnly, setShowNewOnly] = useState(false);

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

  const NEW_THRESHOLD_MS = 90 * 60 * 1000;

  const newCount = useMemo(() => {
    const now = Date.now();
    return nonAccommodationPois.filter(p => now - new Date(p.createdAt).getTime() < NEW_THRESHOLD_MS).length;
  }, [nonAccommodationPois]);

  const filteredPois = useMemo(() => {
    if (!activeTrip) return [];
    let pois = statusFilters.has('all') ? nonAccommodationPois : nonAccommodationPois.filter(p => statusFilters.has(p.status));
    if (!categoryFilters.has('all')) {
      pois = pois.filter(p => categoryFilters.has(p.category));
    }
    if (showNewOnly) {
      const now = Date.now();
      pois = pois.filter(p => now - new Date(p.createdAt).getTime() < NEW_THRESHOLD_MS);
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
  }, [nonAccommodationPois, statusFilters, categoryFilters, showNewOnly, searchQuery, activeTrip]);

  const grouped = useMemo(() => {
    // First pass: group by primary key
    const primaryGroups: Record<string, PointOfInterest[]> = {};

    for (const poi of filteredPois) {
      let key: string;
      if (groupBy === 'category') {
        key = poi.category;
      } else if (groupBy === 'location') {
        const city = poi.location.city?.toLowerCase() || '';
        key = cityRegionMap[city] || poi.location.country || t('common.unknown');
      } else {
        key = poi.status;
      }
      if (!primaryGroups[key]) primaryGroups[key] = [];
      primaryGroups[key].push(poi);
    }

    // For location grouping: merge small groups (≤3 items) up to country level
    const MERGE_UP_THRESHOLD = 3;
    if (groupBy === 'location') {
      // Build region → country map from sites
      const regionCountryMap: Record<string, string> = {};
      for (const s of sites) {
        if (s.path.length >= 2) {
          regionCountryMap[s.path[1]] = s.path[0];
        }
      }

      const keysToMerge: string[] = [];
      for (const [key, items] of Object.entries(primaryGroups)) {
        const country = regionCountryMap[key];
        if (items.length <= MERGE_UP_THRESHOLD && country && country !== key) {
          keysToMerge.push(key);
        }
      }

      // Merge small regions into "country::General"
      for (const key of keysToMerge) {
        const country = regionCountryMap[key];
        const mergedKey = `${country}::${t('common.general')}`;
        if (!primaryGroups[mergedKey]) primaryGroups[mergedKey] = [];
        primaryGroups[mergedKey].push(...primaryGroups[key]);
        delete primaryGroups[key];
      }
    }

    // Second pass: split sub-groups with >6 items into separate rows
    const result: [string, PointOfInterest[]][] = [];
    const SUB_GROUP_THRESHOLD = 6;

    for (const [key, pois] of Object.entries(primaryGroups)) {
      if ((groupBy === 'category' || groupBy === 'location') && !key.includes('::')) {
        // Build sub-groups
        const subMap: Record<string, PointOfInterest[]> = {};
        for (const poi of pois) {
          let sub: string;
          if (groupBy === 'category') {
            // Use categoryGroup from config when available, fall back to subCategory
            sub = (poi.subCategory && getSubCategoryGroup(poi.subCategory)) || poi.subCategory || '—';
          } else {
            sub = poi.location.city || poi.location.country || '—';
          }
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
            result.push([`${key}::${t('common.general')}`, remaining]);
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
  }, [filteredPois, groupBy, cityRegionMap, sites, sortBy]);

  const getGroupLabel = (key: string): string => {
    // Handle split sub-group keys like "category::subName"
    const [primary, sub] = key.split('::');
    const baseLabel = groupBy === 'category' ? getCategoryLabel(primary)
      : groupBy === 'status' ? (t(`status.${primary}`, primary))
      : primary;
    if (!sub) return baseLabel;
    // Try categoryGroup label first, then subCategory label
    const subLabel = getCategoryGroupLabel(sub) !== sub ? getCategoryGroupLabel(sub) : getSubCategoryLabel(sub);
    return `${baseLabel} | ${subLabel}`;
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
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('poisPage.title')}</h2>
            <p className="text-muted-foreground">{filteredPois.length} / {nonAccommodationPois.length} {t('common.items')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={mergeMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setMergeMode(prev => !prev); setSelectedForMerge(new Set()); }}
              className="gap-1"
            >
              <Merge size={14} />
              {mergeMode ? t('common.cancelMerge') : t('common.merge')}
            </Button>
            {!mergeMode && <div className="max-sm:hidden"><CreatePOIForm /></div>}
          </div>
        </div>

        {/* Collapsible Filter/Sort/Search Panel */}
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setFiltersOpen(prev => !prev)}
            className="flex items-center justify-between w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal size={16} />
              <span>{t('poisPage.filterSortSearch')}</span>
              {(!statusFilters.has('all') || !categoryFilters.has('all') || showNewOnly || searchQuery) && (
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                  {(statusFilters.has('all') ? 0 : statusFilters.size) + (categoryFilters.has('all') ? 0 : categoryFilters.size) + (showNewOnly ? 1 : 0) + (searchQuery ? 1 : 0)}
                </span>
              )}
            </div>
            {filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {filtersOpen && (
            <div className="p-3 space-y-3 border-t">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t('poisPage.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-8 h-9 text-sm"
                />
              </div>

              {/* Group & Sort */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  <LayoutGrid size={14} className="text-muted-foreground" />
                  <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="category">{t('poisPage.byCategory')}</SelectItem>
                      <SelectItem value="location">{t('poisPage.byLocation')}</SelectItem>
                      <SelectItem value="status">{t('poisPage.byStatus')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <ArrowUpDown size={14} className="text-muted-foreground" />
                  <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{t('poisPage.byName')}</SelectItem>
                      <SelectItem value="updated_at">{t('poisPage.byUpdated')}</SelectItem>
                      <SelectItem value="created_at">{t('poisPage.byCreated')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Status Filters */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">{t('poisPage.statusLabel')}</span>
                <div className="flex gap-1 flex-wrap">
                  <Badge
                    variant={statusFilters.has('all') ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleStatusFilter('all')}
                  >
                    {t('common.all')} ({statusCounts.all || 0})
                  </Badge>
                  {(['suggested', 'interested', 'planned', 'scheduled', 'booked', 'visited', 'skipped'] as POIStatus[]).map(s => (
                    statusCounts[s] ? (
                      <Badge
                        key={s}
                        variant={statusFilters.has(s) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleStatusFilter(s)}
                      >
                        {t(`status.${s}`)} ({statusCounts[s]})
                      </Badge>
                    ) : null
                  ))}
                </div>
              </div>

              {/* New filter */}
              {newCount > 0 && (
                <div>
                  <Badge
                    variant={showNewOnly ? 'default' : 'outline'}
                    className="cursor-pointer text-xs gap-1"
                    onClick={() => setShowNewOnly(prev => !prev)}
                  >
                    <Sparkles size={12} />
                    {t('poisPage.newOnly')} ({newCount})
                  </Badge>
                </div>
              )}

              {/* Category Filters */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">{t('poisPage.categoryLabel')}</span>
                <div className="flex gap-1 flex-wrap">
                  <Badge
                    variant={categoryFilters.has('all') ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleCategoryFilter('all')}
                  >
                    {t('common.all')}
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
            <div className="w-full overflow-x-auto will-change-transform" style={{ WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)' }}>
              <div className="flex gap-3 pb-3" style={{ minWidth: 'max-content' }}>
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
            </div>
          </div>
        ))}

        {filteredPois.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {nonAccommodationPois.length === 0 ? t('poisPage.noPoiYet') : t('poisPage.noFilterResults')}
          </div>
        )}

        {mergeMode && selectedForMerge.size === 2 && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
            <Button onClick={() => setMergeDialogOpen(true)} className="gap-1.5 shadow-lg">
              <Merge size={16} /> {t('common.mergeSelected')}
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
