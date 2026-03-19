import type { PointOfInterest } from '@/types/trip';
import type { DraftDay } from '@/types/itineraryDraft';
import type { Json } from '@/integrations/supabase/types';
import { createOrMergePOI } from './poiService';
import { supabase } from './helpers';

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
 * - Merges draft activities into existing itinerary_days (preserves scheduled/planned items)
 */
export async function applyDraftToTrip(
  tripId: string,
  draft: DraftDay[],
  _existingPois: PointOfInterest[],
): Promise<void> {
  const poiIdMap = new Map<string, string>(); // "name|category" → POI ID

  // 1) Resolve all place names to POI IDs
  for (const day of draft) {
    for (const place of day.places) {
      const key = `${place.name}|${place.category}`;
      if (poiIdMap.has(key)) continue;

      // If this place came from a real POI, reuse its ID
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

  // 2) Merge into itinerary days
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

    if (existingDay) {
      // Preserve existing non-POI activities (time_blocks, collections)
      // and POIs that are NOT in the draft (they were already there)
      const existingActivities = (existingDay.activities || []) as unknown as ActivityEntry[];
      const preserved = existingActivities.filter(a => {
        if (a.type !== 'poi') return true; // keep time_blocks, collections
        if (draftPoiIds.has(a.id)) return false; // draft replaces this
        return true; // keep POIs not in draft (user's other planned items)
      });

      // Merge: draft activities first (with their order), then preserved items after
      const maxOrder = newActivities.length;
      const merged = [
        ...newActivities,
        ...preserved.map((a, i) => ({ ...a, order: maxOrder + i + 1 })),
      ];

      await supabase
        .from('itinerary_days')
        .update({
          activities: merged as unknown as Json,
          location_context: day.locationContext || (existingDay as Record<string, unknown>).location_context as string || undefined,
        })
        .eq('id', existingDay.id);
    } else {
      await supabase
        .from('itinerary_days')
        .insert([{
          trip_id: tripId,
          day_number: day.dayNumber,
          location_context: day.locationContext || null,
          activities: newActivities as unknown as Json,
        }]);
    }
  }
}
