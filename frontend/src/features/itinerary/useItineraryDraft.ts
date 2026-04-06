import { useState, useCallback } from 'react';
import type { ItineraryDay, PointOfInterest } from '@/types/trip';
import type { DraftDay, DraftPlace } from '@/types/itineraryDraft';
import { CATEGORY_MAP } from '@/shared/utils/categoryMap';

export function useItineraryDraft() {
  const [draft, setDraft] = useState<DraftDay[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  /** Convert real itinerary + POIs into a draft */
  const initFromReal = useCallback((itineraryDays: ItineraryDay[], pois: PointOfInterest[]) => {
    const poiMap = new Map(pois.map(p => [p.id, p]));

    const draftDays: DraftDay[] = itineraryDays.map(day => {
      const selectedHotel = day.accommodationOptions?.find(a => a.is_selected);
      const hotelPoi = selectedHotel ? poiMap.get(selectedHotel.poi_id) : undefined;
      return {
        dayNumber: day.dayNumber,
        date: day.date,
        locationContext: undefined,
        hotelId: hotelPoi?.id,
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
      };
    });

    setDraft(draftDays);
    setIsDirty(false);
    setIsInitialized(true);
  }, []);

  /** Apply AI tool call result — replaces the entire draft. Returns the normalized days. */
  const applyToolCall = useCallback((days: DraftDay[]): DraftDay[] => {
    // Normalize the AI response (handles snake_case from Gemini)
    const normalized = days.map(d => {
      const raw = d as unknown as Record<string, unknown>;
      return {
        dayNumber: (d.dayNumber ?? raw.day_number) as number,
        date: d.date,
        locationContext: d.locationContext ?? raw.location_context as string | undefined,
        locationId: (d.locationId ?? raw.location_id) as string | undefined,
        locationName: (d.locationName ?? raw.location_name) as string | undefined,
        locationParentId: (d.locationParentId ?? raw.location_parent_id) as string | undefined,
        hotelId: (d.hotelId ?? raw.hotel_id) as string | undefined,
        hotelName: (d.hotelName ?? raw.hotel_name) as string | undefined,
        hotelPlaceType: (d.hotelPlaceType ?? raw.hotel_place_type ?? raw.hotel_type) as string | undefined,
        places: ((d.places || raw.places || []) as Record<string, unknown>[]).map(p => ({
          existingPoiId: (p.existingPoiId ?? p.place_id) as string | undefined,
          locationId: (p.locationId ?? p.location_id) as string | undefined,
          locationName: (p.locationName ?? p.location_name) as string | undefined,
          locationParentId: (p.locationParentId ?? p.location_parent_id) as string | undefined,
          eventId: (p.eventId ?? p.event_id) as string | undefined,
          name: ((p.name ?? p.place_name) as string) || '',
          category: CATEGORY_MAP[p.category as string] || p.category as string || 'attraction',
          placeType: (p.placeType ?? p.place_type ?? p.eatery_type ?? p.transport_type ?? p.event_type ?? p.sub_category) as string | undefined,
          activityType: (p.activityType ?? p.activity_type) as string | undefined,
          description: p.description as string | undefined,
          isSpecificPlace: p.isSpecificPlace as boolean | undefined ?? p.is_specific_place as boolean | undefined,
          city: p.city as string | undefined,
          notes: p.notes as string | undefined,
          startTime: (p.startTime ?? p.start_time) as string | undefined,
          dayPart: (p.dayPart ?? p.day_part) as string | undefined,
          duration: p.duration as string | undefined,
        })) as DraftPlace[],
      };
    });
    setDraft(normalized);
    setIsDirty(true);
    return normalized;
  }, []);

  /** Clear the draft to start fresh */
  const clearDraft = useCallback(() => {
    setDraft([]);
    setIsDirty(true);
  }, []);

  return { draft, isDirty, isInitialized, initFromReal, applyToolCall, clearDraft };
}
