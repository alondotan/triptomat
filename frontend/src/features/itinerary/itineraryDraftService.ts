import type { PointOfInterest } from '@/types/trip';
import type { DraftDay } from '@/types/itineraryDraft';
import type { Json } from '@/integrations/supabase/types';
import { createOrMergePOI } from '@/features/poi/poiService';
import { supabase } from '@/shared/services/helpers';
import { createTripPlace, findTripPlaceByLocationId } from '@/features/trip/tripPlaceService';
import type { TripPlace } from '@/types/trip';

/** Fire-and-forget: enrich a newly created POI (coords, image, subCategory). */
function enrichNewPOI(poi: PointOfInterest): void {
  if (poi.imageUrl && poi.location?.coordinates?.lat && poi.subCategory) return;
  supabase.functions.invoke('fetch-poi-image', {
    body: {
      poiId: poi.id,
      name: poi.name,
      category: poi.category,
      city: poi.location?.city,
      country: poi.location?.country,
      address: poi.location?.address,
    },
  }).catch(err => console.warn('[itineraryDraft] Enrich failed:', err));
}

interface ActivityEntry {
  id: string;
  type: string;
  order: number;
  schedule_state?: string;
  time_window?: { start?: string; end?: string };
  [key: string]: Json | undefined; // index signature for Json compatibility
}

/**
 * Apply a draft itinerary to the real trip.
 * - Resolves place names to POI IDs (creates new POIs as needed via createOrMergePOI)
 * - Resolves locationContext names → trip_places (creates new trip_place if needed)
 * - Merges draft activities into existing itinerary_days (preserves scheduled/planned items)
 */
export async function applyDraftToTrip(
  tripId: string,
  draft: DraftDay[],
  _existingPois: PointOfInterest[],
  existingTripPlaces: TripPlace[],
): Promise<void> {
  const poiIdMap = new Map<string, string>(); // "name|category" → POI ID

  // 1) Resolve all place names to POI IDs
  for (const day of draft) {
    for (const place of day.places) {
      const key = `${place.name}|${place.category}`;
      if (poiIdMap.has(key)) continue;

      if (place.existingPoiId) {
        poiIdMap.set(key, place.existingPoiId);
        continue;
      }

      const { poi, merged } = await createOrMergePOI({
        tripId,
        category: place.category as PointOfInterest['category'],
        name: place.name,
        status: 'suggested',
        location: {
          city: place.city || undefined,
        },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        details: {
          notes: place.notes ? { user_summary: place.notes } : undefined,
        },
        isCancelled: false,
        isPaid: false,
      } as Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>);

      if (!merged) enrichNewPOI(poi);
      poiIdMap.set(key, poi.id);
    }
  }

  // 2) Resolve locationContext names → trip_place IDs
  //    Find matching trip_location by name, then find or create a trip_place for it
  const tripPlaceIdMap = new Map<string, string>(); // locationContext (lower) → trip_place.id
  const mutableTripPlaces = [...existingTripPlaces];

  const uniqueLocations = [...new Set(draft.map(d => d.locationContext).filter(Boolean))] as string[];
  if (uniqueLocations.length > 0) {
    const { data: tripLocs } = await supabase
      .from('trip_locations')
      .select('id, name')
      .eq('trip_id', tripId);

    for (const locName of uniqueLocations) {
      const tripLoc = (tripLocs || []).find(
        l => l.name.toLowerCase() === locName.toLowerCase(),
      );
      if (!tripLoc) continue;

      // Find existing trip_place or create one
      let tripPlace = findTripPlaceByLocationId(mutableTripPlaces, tripLoc.id);
      if (!tripPlace) {
        tripPlace = await createTripPlace(tripId, tripLoc.id, { sortOrder: mutableTripPlaces.length });
        mutableTripPlaces.push(tripPlace);
      }
      tripPlaceIdMap.set(locName.toLowerCase(), tripPlace.id);
    }
  }

  // 3) Merge into itinerary days
  for (const day of draft) {
    const { data: existingDay } = await supabase
      .from('itinerary_days')
      .select('id, activities')
      .eq('trip_id', tripId)
      .eq('day_number', day.dayNumber)
      .maybeSingle();

    // Build new activity entries from draft
    const draftPoiIds = new Set<string>();
    const newActivities: ActivityEntry[] = day.places
      .map((place, idx) => {
        const poiId = poiIdMap.get(`${place.name}|${place.category}`) || '';
        if (poiId) draftPoiIds.add(poiId);
        return {
          order: idx + 1,
          type: 'poi' as const,
          id: poiId,
          schedule_state: 'potential' as const,
          time_window: place.time ? { start: place.time } : undefined,
        };
      })
      .filter(a => a.id);

    const tripPlaceId = day.locationContext
      ? tripPlaceIdMap.get(day.locationContext.toLowerCase()) ?? null
      : null;

    if (existingDay) {
      const existingActivities = (existingDay.activities || []) as unknown as ActivityEntry[];
      const preserved = existingActivities.filter(a => {
        if (a.type !== 'poi') return true;
        if (draftPoiIds.has(a.id)) return false;
        return true;
      });

      const maxOrder = newActivities.length;
      const merged = [
        ...newActivities,
        ...preserved.map((a, i) => ({ ...a, order: maxOrder + i + 1 })),
      ];

      const updatePayload: Record<string, unknown> = {
        activities: merged as unknown as Json,
      };
      if (tripPlaceId) updatePayload.trip_place_id = tripPlaceId;

      await supabase
        .from('itinerary_days')
        .update(updatePayload)
        .eq('id', existingDay.id);
    } else {
      await supabase
        .from('itinerary_days')
        .insert([{
          trip_id: tripId,
          day_number: day.dayNumber,
          trip_place_id: tripPlaceId,
          activities: newActivities as unknown as Json,
        }]);
    }
  }
}
