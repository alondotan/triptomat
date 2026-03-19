import { useState, useCallback } from 'react';
import type { ItineraryDay, PointOfInterest } from '@/types/trip';
import type { DraftDay, DraftPlace } from '@/types/itineraryDraft';

const CATEGORY_MAP: Record<string, DraftPlace['category']> = {
  accommodation: 'accommodation',
  eatery: 'eatery',
  attraction: 'attraction',
  service: 'service',
};

export function useItineraryDraft() {
  const [draft, setDraft] = useState<DraftDay[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  /** Convert real itinerary + POIs into a draft */
  const initFromReal = useCallback((itineraryDays: ItineraryDay[], pois: PointOfInterest[]) => {
    const poiMap = new Map(pois.map(p => [p.id, p]));

    const draftDays: DraftDay[] = itineraryDays.map(day => ({
      dayNumber: day.dayNumber,
      date: day.date,
      locationContext: day.locationContext,
      places: (day.activities || [])
        .filter(a => a.type === 'poi')
        .sort((a, b) => a.order - b.order)
        .map(a => {
          const poi = poiMap.get(a.id);
          return {
            name: poi?.name || 'Unknown',
            category: CATEGORY_MAP[poi?.category || ''] || 'attraction',
            city: poi?.location?.city,
            existingPoiId: a.id,
            time: a.time_window?.start,
          };
        }),
    }));

    setDraft(draftDays);
    setIsDirty(false);
    setIsInitialized(true);
  }, []);

  /** Apply AI tool call result — replaces the entire draft */
  const applyToolCall = useCallback((days: DraftDay[]) => {
    // Normalize the AI response
    const normalized = days.map(d => ({
      dayNumber: d.dayNumber ?? (d as any).day_number,
      date: d.date,
      locationContext: d.locationContext ?? (d as any).location_context,
      places: (d.places || []).map(p => ({
        name: p.name,
        category: (CATEGORY_MAP[p.category] || 'attraction') as DraftPlace['category'],
        city: p.city,
        notes: p.notes,
        time: p.time,
        duration: p.duration,
      })),
    }));
    setDraft(normalized);
    setIsDirty(true);
  }, []);

  /** Clear the draft to start fresh */
  const clearDraft = useCallback(() => {
    setDraft([]);
    setIsDirty(true);
  }, []);

  return { draft, isDirty, isInitialized, initFromReal, applyToolCall, clearDraft };
}
