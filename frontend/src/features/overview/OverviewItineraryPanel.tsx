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
  /** When set, renders these days instead of the live itinerary (snapshot/preview mode) */
  overrideDays?: DraftDay[];
}

export function OverviewItineraryPanel({ selectedName, onSelectName, overrideDays }: OverviewItineraryPanelProps = {}) {
  const { t } = useTranslation();
  const { itineraryDays } = useItinerary();
  const { pois } = usePOI();
  const { tripLocations, tripPlaces } = useActiveTrip();

  const liveDays = useMemo<DraftDay[]>(() => {
    const poiMap = new Map(pois.map(p => [p.id, p]));
    // Build map: trip_place_id → location name
    const placeLocMap = new Map(
      tripPlaces.map(tp => {
        const loc = tripLocations.find(l => l.id === tp.tripLocationId);
        return [tp.id, loc?.name ?? ''];
      })
    );

    return itineraryDays.map(day => ({
      dayNumber: day.dayNumber,
      date: day.date,
      locationContext: (day.tripPlaceId && placeLocMap.get(day.tripPlaceId)) || undefined,
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
  }, [itineraryDays, pois, tripLocations, tripPlaces]);

  const days = overrideDays ?? liveDays;

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
