import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useItinerary } from '@/context/ItineraryContext';
import { useFinance } from '@/context/FinanceContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { SubCategoryIcon } from '@/components/shared/SubCategoryIcon';
import { POIDetailDialog } from '@/components/poi/POIDetailDialog';
import { Heart, ArrowRight, MapPin, Clock, CalendarDays, ExternalLink } from 'lucide-react';
import { useCountrySites, type SiteNode } from '@/hooks/useCountrySites';
import { getCategoryIcon, getCategoryLabel } from '@/lib/subCategoryConfig';
import { supabase } from '@/integrations/supabase/client';
import type { PointOfInterest, POIStatus } from '@/types/trip';

const statusLabels: Record<string, string> = {
  suggested: 'מוצע',
  interested: 'מעניין',
  planned: 'מתוכנן',
  scheduled: 'בלו״ז',
  booked: 'הוזמן',
  visited: 'בוקר',
  skipped: 'דילגתי',
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}'`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}ש'` : `${h}:${m.toString().padStart(2, '0')}`;
}

interface QuoteData {
  paragraph: string;
  sourceUrl?: string;
}

type GroupBy = 'category' | 'location' | 'status';

const POIGroupPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const groupBy = (searchParams.get('groupBy') || 'category') as GroupBy;
  const groupKey = searchParams.get('key') || '';

  const { activeTrip, tripSitesHierarchy } = useActiveTrip();
  const { pois, updatePOI } = usePOI();
  const { itineraryDays } = useItinerary();
  const { formatDualCurrency } = useFinance();
  const [dialogPoi, setDialogPoi] = useState<PointOfInterest | null>(null);
  const [quotesMap, setQuotesMap] = useState<Record<string, QuoteData[]>>({});

  const countries = activeTrip?.countries || [];
  const { sites } = useCountrySites(countries, tripSitesHierarchy as SiteNode[]);

  const cityRegionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sites) {
      if (s.path.length >= 2) {
        map[s.label.toLowerCase()] = s.path[1];
      }
    }
    return map;
  }, [sites]);

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
    for (const id of Object.keys(map)) map[id].sort((a, b) => a - b);
    return map;
  }, [itineraryDays]);

  const nonAccommodationPois = useMemo(() => pois.filter(p => p.category !== 'accommodation'), [pois]);

  const groupPois = useMemo(() => {
    const [primaryKey, subKey] = groupKey.includes('::') ? groupKey.split('::') : [groupKey, null];

    return nonAccommodationPois.filter(poi => {
      let poiPrimaryKey: string;
      if (groupBy === 'category') {
        poiPrimaryKey = poi.category;
      } else if (groupBy === 'location') {
        const city = poi.location.city?.toLowerCase() || '';
        poiPrimaryKey = cityRegionMap[city] || poi.location.country || 'לא ידוע';
      } else {
        poiPrimaryKey = poi.status;
      }
      if (poiPrimaryKey !== primaryKey) return false;

      if (!subKey) return true;

      if (subKey === 'כללי') {
        const allInPrimary = nonAccommodationPois.filter(p => {
          if (groupBy === 'category') return p.category === primaryKey;
          if (groupBy === 'location') {
            const c = p.location.city?.toLowerCase() || '';
            return (cityRegionMap[c] || p.location.country || 'לא ידוע') === primaryKey;
          }
          return p.status === primaryKey;
        });
        const subCounts: Record<string, number> = {};
        for (const p of allInPrimary) {
          const sub = groupBy === 'category'
            ? (p.subCategory || '—')
            : (p.location.city || p.location.country || '—');
          subCounts[sub] = (subCounts[sub] || 0) + 1;
        }
        const poiSub = groupBy === 'category'
          ? (poi.subCategory || '—')
          : (poi.location.city || poi.location.country || '—');
        return subCounts[poiSub] <= 6;
      }

      if (groupBy === 'category') return (poi.subCategory || '—') === subKey;
      return (poi.location.city || poi.location.country || '—') === subKey;
    });
  }, [nonAccommodationPois, groupBy, groupKey, cityRegionMap]);

  // Fetch recommendation quotes for all POIs in group
  useEffect(() => {
    if (groupPois.length === 0) return;

    const newMap: Record<string, QuoteData[]> = {};

    // Collect inline quotes
    for (const poi of groupPois) {
      const details = poi.details as Record<string, unknown>;
      if (details.paragraph) {
        newMap[poi.id] = [{
          paragraph: details.paragraph as string,
          sourceUrl: details.source_url as string | undefined,
        }];
      }
    }

    // Collect all recommendation IDs
    const recIdToPois: Record<string, PointOfInterest[]> = {};
    for (const poi of groupPois) {
      for (const recId of poi.sourceRefs.recommendation_ids || []) {
        if (!recIdToPois[recId]) recIdToPois[recId] = [];
        recIdToPois[recId].push(poi);
      }
    }

    const allRecIds = Object.keys(recIdToPois);
    if (allRecIds.length === 0) {
      setQuotesMap(newMap);
      return;
    }

    supabase
      .from('source_recommendations')
      .select('id, source_url, analysis')
      .in('id', allRecIds)
      .then(({ data }) => {
        data?.forEach(rec => {
          const analysis = rec.analysis as Record<string, unknown> | null;
          const items = (analysis?.extracted_items || analysis?.recommendations || []) as Array<{ name: string; paragraph: string }>;
          const linkedPois = recIdToPois[rec.id] || [];

          for (const poi of linkedPois) {
            const matchingItem = items.find(item =>
              item.name.toLowerCase().includes(poi.name.toLowerCase()) ||
              poi.name.toLowerCase().includes(item.name.toLowerCase())
            );
            if (matchingItem) {
              const quote: QuoteData = {
                paragraph: matchingItem.paragraph,
                sourceUrl: rec.source_url || undefined,
              };
              if (!newMap[poi.id]) newMap[poi.id] = [];
              // Deduplicate
              if (!newMap[poi.id].some(q => q.paragraph === quote.paragraph)) {
                newMap[poi.id].push(quote);
              }
            }
          }
        });
        setQuotesMap({ ...newMap });
      });
  }, [groupPois]);

  const getLabel = (): string => {
    const [primaryKey, subKey] = groupKey.includes('::') ? groupKey.split('::') : [groupKey, null];
    const baseLabel = groupBy === 'category' ? getCategoryLabel(primaryKey)
      : groupBy === 'status' ? (statusLabels[primaryKey] || primaryKey)
      : primaryKey;
    return subKey ? `${baseLabel} | ${subKey}` : baseLabel;
  };

  const getIcon = (): React.ReactNode => {
    const primaryKey = groupKey.split('::')[0];
    if (groupBy === 'category') { const Icon = getCategoryIcon(primaryKey); return <Icon size={20} />; }
    if (groupBy === 'location') return <MapPin size={20} />;
    return null;
  };

  const handleToggleLike = async (poi: PointOfInterest, e: React.MouseEvent) => {
    e.stopPropagation();
    if (['planned', 'scheduled', 'booked', 'visited', 'skipped'].includes(poi.status)) return;
    const newStatus: POIStatus = poi.status === 'interested' ? 'suggested' : 'interested';
    await updatePOI({ ...poi, status: newStatus });
  };

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/pois')}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowRight size={20} />
          </button>
          <div className="flex items-center gap-2">
            {getIcon()}
            <h2 className="text-xl font-bold">{getLabel()}</h2>
            <Badge variant="secondary" className="text-xs">{groupPois.length}</Badge>
          </div>
        </div>

        {/* Vertical list */}
        <div className="space-y-5">
          {groupPois.map(poi => {
            const quotes = quotesMap[poi.id] || [];
            const duration = poi.details.activity_details?.duration;
            const cost = poi.details.cost;
            const days = poiDaysMap[poi.id];
            const location = [poi.location.address, poi.location.city, poi.location.country].filter(Boolean).join(', ');

            return (
              <div
                key={poi.id}
                className={`cursor-pointer rounded-xl overflow-hidden transition-colors hover:bg-muted/30 ${poi.isCancelled ? 'opacity-50' : ''}`}
                onClick={() => setDialogPoi(poi)}
              >
                {/* Image with heart overlay */}
                <div className="relative w-full aspect-[16/9] overflow-hidden rounded-xl bg-muted">
                  {poi.imageUrl ? (
                    <img src={poi.imageUrl} alt={poi.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <SubCategoryIcon type={poi.subCategory || ''} size={48} className="text-muted-foreground/30" />
                    </div>
                  )}
                  <button
                    onClick={(e) => handleToggleLike(poi, e)}
                    className={`absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/30 backdrop-blur-sm transition-colors ${
                      poi.status === 'interested' || poi.status === 'planned' || poi.status === 'scheduled' ? 'text-red-500' :
                      poi.status === 'booked' || poi.status === 'visited' || poi.status === 'skipped' ? 'text-white/40 cursor-default' :
                      'text-white/70 hover:text-red-400'
                    }`}
                  >
                    <Heart size={16} fill={poi.status !== 'suggested' ? 'currentColor' : 'none'} />
                  </button>
                  {/* Status badge on image */}
                  <Badge
                    variant={poi.status === 'booked' ? 'default' : 'secondary'}
                    className="absolute bottom-2.5 left-2.5 text-xs backdrop-blur-sm"
                  >
                    {statusLabels[poi.status] || poi.status}
                  </Badge>
                </div>

                {/* Details below image */}
                <div className="px-1 pt-2.5 pb-1 space-y-2">
                  {/* Title + meta row */}
                  <div>
                    <h3 className="text-base font-semibold">{poi.name}</h3>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
                      {poi.subCategory && (
                        <span className="flex items-center gap-1">
                          <SubCategoryIcon type={poi.subCategory} size={13} />
                          {poi.subCategory}
                        </span>
                      )}
                      {location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} className="shrink-0" />
                          <span className="truncate">{location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info chips row */}
                  {(duration != null || (cost && cost.amount > 0) || (days && days.length > 0)) && (
                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      {duration != null && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock size={13} />
                          {formatDuration(duration)}
                        </span>
                      )}
                      {cost && cost.amount > 0 && (
                        <span className="font-semibold text-primary">
                          {formatDualCurrency(cost.amount, cost.currency || activeTrip?.currency || 'USD')}
                        </span>
                      )}
                      {days && days.length > 0 && (
                        <span className="flex items-center gap-1">
                          <CalendarDays size={12} className="text-muted-foreground" />
                          {days.map(d => (
                            <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">יום {d}</Badge>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  {/* User notes */}
                  {poi.details.notes?.user_summary && (
                    <p className="text-sm text-muted-foreground italic">{poi.details.notes.user_summary}</p>
                  )}

                  {/* Recommendation quotes */}
                  {quotes.length > 0 && (
                    <div className="space-y-1.5">
                      {quotes.map((q, i) => (
                        <div key={i} className="bg-muted/50 rounded-lg p-2.5 text-sm border border-border/50">
                          <p className="text-muted-foreground italic leading-relaxed" dir="auto">&ldquo;{q.paragraph}&rdquo;</p>
                          {q.sourceUrl && (
                            <a
                              href={q.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink size={11} /> מקור
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {groupPois.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">אין פריטים בקבוצה זו.</div>
        )}
      </div>

      {dialogPoi && (
        <POIDetailDialog poi={dialogPoi} open={!!dialogPoi} onOpenChange={(open) => { if (!open) setDialogPoi(null); }} />
      )}
    </AppLayout>
  );
};

export default POIGroupPage;
