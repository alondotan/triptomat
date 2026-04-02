import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { usePOI } from '@/features/poi/POIContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { ItineraryTree } from '@/shared/components/ItineraryTree';
import type { DraftDay, DraftPlace } from '@/types/itineraryDraft';

const CATEGORY_MAP: Record<string, DraftPlace['category']> = {
  accommodation: 'accommodation',
  eatery: 'eatery',
  attraction: 'attraction',
  service: 'service',
};

interface OverviewItineraryPanelProps {
  selectedName?: string | null;
  onSelectName?: (name: string | null) => void;
}

export function OverviewItineraryPanel({ selectedName, onSelectName }: OverviewItineraryPanelProps = {}) {
  const { t } = useTranslation();
  const { itineraryDays } = useItinerary();
  const { pois } = usePOI();
  const { tripLocations } = useActiveTrip();

  const days = useMemo<DraftDay[]>(() => {
    const poiMap = new Map(pois.map(p => [p.id, p]));
    const locMap = new Map(tripLocations.filter(tl => !tl.isTemporary).map(tl => [tl.id, tl.name]));

    return itineraryDays.map(day => ({
      dayNumber: day.dayNumber,
      date: day.date,
      locationContext: (day.tripLocationId && locMap.get(day.tripLocationId)) || day.locationContext,
      places: (day.activities || [])
        .filter(a => a.type === 'poi' && poiMap.has(a.id))
        .sort((a, b) => a.order - b.order)
        .map(a => {
          const poi = poiMap.get(a.id)!;
          return {
            name: poi.name,
            category: CATEGORY_MAP[poi.category || ''] || 'attraction',
            city: poi.location?.city,
            existingPoiId: a.id,
            time: a.time_window?.start,
          };
        }),
    }));
  }, [itineraryDays, pois, tripLocations]);

  return (
    <div className="flex flex-col min-h-0">
      <h3 className="text-sm font-semibold px-2 py-2 shrink-0">{t('overview.itinerary')}</h3>
      <div className="overflow-y-auto flex-1 min-h-0 px-1">
        <ItineraryTree
          days={days}
          emptyText={t('overview.noItinerary')}
          selectedName={selectedName ?? null}
          onSelectName={onSelectName}
        />
      </div>
    </div>
  );
}
