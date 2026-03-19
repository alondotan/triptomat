import type { PointOfInterest } from '@/types/trip';
import type { DraftDay } from '@/types/itineraryDraft';
import { createOrMergePOI } from './poiService';
import { supabase } from './helpers';

/**
 * Apply a draft itinerary to the real trip.
 * - Resolves place names to POI IDs (creates new POIs as needed via createOrMergePOI)
 * - Creates/updates itinerary_days with activities
 */
export async function applyDraftToTrip(
  tripId: string,
  draft: DraftDay[],
  existingPois: PointOfInterest[],
): Promise<void> {
  const poiIdMap = new Map<string, string>(); // "name|category" → POI ID

  // 1) Resolve all place names to POI IDs
  for (const day of draft) {
    for (const place of day.places) {
      const key = `${place.name}|${place.category}`;
      if (poiIdMap.has(key)) continue;

      // Check if we already have a matching POI
      if (place.existingPoiId) {
        poiIdMap.set(key, place.existingPoiId);
        continue;
      }

      // Use createOrMergePOI to find existing or create new
      const { poi } = await createOrMergePOI({
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

      poiIdMap.set(key, poi.id);
    }
  }

  // 2) Create/update itinerary days
  for (const day of draft) {
    // Find or create the itinerary day
    const { data: existingDay } = await supabase
      .from('itinerary_days')
      .select('id, activities')
      .eq('trip_id', tripId)
      .eq('day_number', day.dayNumber)
      .maybeSingle();

    const activities = day.places.map((place, idx) => ({
      order: idx + 1,
      type: 'poi' as const,
      id: poiIdMap.get(`${place.name}|${place.category}`) || '',
      schedule_state: 'potential' as const,
      time_window: place.time ? { start: place.time } : undefined,
    })).filter(a => a.id); // skip any unresolved

    if (existingDay) {
      await supabase
        .from('itinerary_days')
        .update({
          activities,
          location_context: day.locationContext || undefined,
        })
        .eq('id', existingDay.id);
    } else {
      await supabase
        .from('itinerary_days')
        .insert([{
          trip_id: tripId,
          day_number: day.dayNumber,
          location_context: day.locationContext || null,
          activities,
        }]);
    }
  }
}
