import type { PointOfInterest } from '@/types/trip';
import type { DraftDay } from '@/types/itineraryDraft';
import type { Json } from '@/integrations/supabase/types';
import { createOrMergePOI, updatePOI } from '@/features/poi/poiService';
import { supabase, fuzzyMatch } from '@/shared/services/helpers';
import { createTripPlace, findTripPlaceByLocationId } from '@/features/trip/tripPlaceService';
import { addTripLocation, resolveOrAddLocation } from '@/features/trip/tripLocationService';
import type { TripPlace } from '@/types/trip';


interface ActivityEntry {
  id: string;
  type: string;
  order: number;
  schedule_state?: string;
  time_window?: { start?: string; end?: string };
  [key: string]: Json | undefined;
}

/**
 * Resolve the trip_location ID for a place entry.
 *
 * Priority:
 * 1. place has locationId → find that trip_location
 *    - if locationName also provided and fuzzy-differs → create child location under it
 * 2. no locationId, has locationName → resolveOrAddLocation by name
 * 3. neither → return null (will fall back to trip-level)
 */
async function resolveLocationId(
  tripId: string,
  locationId: string | undefined,
  locationName: string | undefined,
): Promise<string | null> {
  if (locationId) {
    // Verify the location exists
    const { data: loc } = await supabase
      .from('trip_locations')
      .select('id, name')
      .eq('trip_id', tripId)
      .eq('id', locationId)
      .maybeSingle();

    if (!loc) return null;

    // If locationName is also given and differs → create child location
    if (locationName && !fuzzyMatch(loc.name, locationName)) {
      const child = await addTripLocation(tripId, locationName, 'city', locationId, 'ai', undefined);
      return child.id;
    }

    return loc.id;
  }

  if (locationName) {
    const loc = await resolveOrAddLocation(tripId, locationName, 'city');
    return loc.id;
  }

  return null;
}

/**
 * Apply a draft itinerary to the real trip.
 *
 * For each place:
 * - existingPoiId → use existing POI, update status to 'planned'
 * - no existingPoiId → create new POI via createOrMergePOI
 *   - locationId/locationName → resolved to a trip_location
 *   - otherwise → trip-level (no city)
 *
 * schedule_state:
 * - startTime present → 'scheduled', time_window: { start: startTime }
 * - dayPart present  → 'potential',  time_window: { start: dayPart }
 * - neither          → 'potential',  no time_window
 *
 * Day-to-location assignment:
 * - Day is assigned to the trip_place of the first place that has a resolved location.
 *
 * Places with same dayPart on the same day are grouped together (same time_window).
 */
export async function applyDraftToTrip(
  tripId: string,
  draft: DraftDay[],
  existingPois: PointOfInterest[],
  existingTripPlaces: TripPlace[],
): Promise<void> {
  const mutableTripPlaces = [...existingTripPlaces];
  const poiMap = new Map(existingPois.map(p => [p.id, p]));

  // Cache: locationId → trip_place.id (to avoid duplicate creates)
  const tripPlaceByLocationId = new Map<string, string>();

  async function getOrCreateTripPlace(resolvedLocId: string): Promise<string> {
    const cached = tripPlaceByLocationId.get(resolvedLocId);
    if (cached) return cached;

    let tripPlace = findTripPlaceByLocationId(mutableTripPlaces, resolvedLocId);
    if (!tripPlace) {
      tripPlace = await createTripPlace(tripId, resolvedLocId, {
        sortOrder: mutableTripPlaces.length,
      });
      mutableTripPlaces.push(tripPlace);
    }
    tripPlaceByLocationId.set(resolvedLocId, tripPlace.id);
    return tripPlace.id;
  }

  for (const day of draft) {
    const newActivities: ActivityEntry[] = [];
    let dayTripPlaceId: string | null = null;

    for (let idx = 0; idx < day.places.length; idx++) {
      const place = day.places[idx];

      // ── Resolve POI ──────────────────────────────────────────────────────
      let poiId: string;

      if (place.existingPoiId) {
        // Use existing POI — update status to 'planned' if not already locked
        poiId = place.existingPoiId;
        const existing = poiMap.get(poiId);
        if (existing && ['suggested', 'interested'].includes(existing.status)) {
          await updatePOI({ ...existing, status: 'planned' });
          poiMap.set(poiId, { ...existing, status: 'planned' });
        }
      } else {
        // Create or merge new POI
        const resolvedLocId = await resolveLocationId(
          tripId,
          place.locationId,
          place.locationName ?? place.city,
        );

        // Find city name for the POI from the resolved location
        let cityName = place.city || place.locationName;
        if (resolvedLocId && !cityName) {
          const { data: loc } = await supabase
            .from('trip_locations')
            .select('name')
            .eq('id', resolvedLocId)
            .maybeSingle();
          if (loc) cityName = loc.name;
        }

        const { poi } = await createOrMergePOI({
          tripId,
          category: place.category as PointOfInterest['category'],
          name: place.name,
          status: 'planned',
          location: { city: cityName },
          sourceRefs: { email_ids: [], recommendation_ids: [] },
          details: {
            notes: place.description || place.notes
              ? { user_summary: place.description || place.notes }
              : undefined,
          },
          isCancelled: false,
          isPaid: false,
        } as Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>);

        poiId = poi.id;
        poiMap.set(poiId, poi);

        // Assign day to this location (first resolved location wins)
        if (resolvedLocId && !dayTripPlaceId) {
          dayTripPlaceId = await getOrCreateTripPlace(resolvedLocId);
        }
      }

      // Also try to assign day location from existing POI's city
      if (!dayTripPlaceId && place.existingPoiId) {
        const resolvedLocId = await resolveLocationId(
          tripId,
          place.locationId,
          place.locationName,
        );
        if (resolvedLocId) {
          dayTripPlaceId = await getOrCreateTripPlace(resolvedLocId);
        }
      }

      // ── Build activity entry ────────────────────────────────────────────
      let scheduleState: 'scheduled' | 'potential' = 'potential';
      let timeWindow: { start?: string; end?: string } | undefined;

      const effectiveTime = place.startTime;
      if (effectiveTime) {
        scheduleState = 'scheduled';
        timeWindow = { start: effectiveTime };
      } else if (place.dayPart) {
        scheduleState = 'potential';
        timeWindow = { start: place.dayPart };
      }

      newActivities.push({
        order: idx + 1,
        type: 'poi',
        id: poiId,
        schedule_state: scheduleState,
        ...(timeWindow ? { time_window: timeWindow } : {}),
      });
    }

    // ── Fallback: resolve day location from locationContext ────────────────
    if (!dayTripPlaceId && day.locationContext) {
      const loc = await resolveOrAddLocation(tripId, day.locationContext, 'city');
      dayTripPlaceId = await getOrCreateTripPlace(loc.id);
    }

    // ── Write itinerary day ───────────────────────────────────────────────
    const { data: existingDay } = await supabase
      .from('itinerary_days')
      .select('id, activities')
      .eq('trip_id', tripId)
      .eq('day_number', day.dayNumber)
      .maybeSingle();

    const validActivities = newActivities.filter(a => a.id);
    const draftPoiIds = new Set(validActivities.map(a => a.id));

    if (existingDay) {
      const existingActivities = (existingDay.activities || []) as unknown as ActivityEntry[];
      const preserved = existingActivities.filter(
        a => a.type !== 'poi' || !draftPoiIds.has(a.id),
      );
      const maxOrder = validActivities.length;
      const merged = [
        ...validActivities,
        ...preserved.map((a, i) => ({ ...a, order: maxOrder + i + 1 })),
      ];

      const updatePayload: Record<string, unknown> = { activities: merged as unknown as Json };
      if (dayTripPlaceId) updatePayload.trip_place_id = dayTripPlaceId;

      await supabase.from('itinerary_days').update(updatePayload).eq('id', existingDay.id);
    } else {
      await supabase.from('itinerary_days').insert([{
        trip_id: tripId,
        day_number: day.dayNumber,
        trip_place_id: dayTripPlaceId,
        activities: validActivities as unknown as Json,
      }]);
    }
  }
}
