import { useCallback, useContext } from 'react';
import { ActiveTripContext } from '@/features/trip/ActiveTripContext';
import { ItineraryContext } from '@/features/itinerary/ItineraryContext';
import { getDescendantNames, type TripLocation } from '@/features/trip/tripLocationService';
import { createItineraryDay, updateItineraryDay } from '@/features/itinerary/itineraryService';
import { createTripPlace, findTripPlaceByLocationId } from '@/features/trip/tripPlaceService';
import type { PointOfInterest, TripPlace } from '@/types/trip';

/**
 * In research mode, auto-assigns a POI to the matching trip_place when liked.
 * Searches the trip location hierarchy for a match (ancestor or descendant),
 * or creates a new trip_place for the POI's city.
 * Safe to use outside of providers (returns a no-op).
 */
export function useResearchAutoAssign() {
  const tripCtx = useContext(ActiveTripContext);
  const itinCtx = useContext(ItineraryContext);
  const activeTrip = tripCtx?.activeTrip;
  const tripLocations = tripCtx?.tripLocations ?? [];
  const tripPlaces = tripCtx?.tripPlaces ?? [];
  const reloadLocations = tripCtx?.reloadLocations;
  const reloadTripPlaces = tripCtx?.reloadTripPlaces;
  const itineraryDays = itinCtx?.itineraryDays ?? [];
  const refetchItinerary = itinCtx?.refetchItinerary;

  const isResearchMode = activeTrip?.status === 'research';


  const autoAssign = useCallback(async (poi: PointOfInterest) => {
    if (!activeTrip || !isResearchMode) return;
    const city = poi.location?.city;
    if (!city) return;
    const cityLower = city.toLowerCase();

    try {
      // Find the POI's city in the trip location hierarchy
      const cityTripLoc = tripLocations.find((l: TripLocation) => l.name.toLowerCase() === cityLower);
      if (!cityTripLoc) return;

      // Collect the city + all its ancestors (e.g. Beijing -> North China -> China)
      const selfAndAncestorIds = new Set<string>();
      let current: TripLocation = cityTripLoc;
      while (current) {
        selfAndAncestorIds.add(current.id);
        if (!current.parentId) break;
        const parent = tripLocations.find((l: TripLocation) => l.id === current.parentId);
        if (!parent) break;
        current = parent;
      }

      // Check if any existing trip_place matches (is the city itself or an ancestor)
      let matchedTripPlace: TripPlace | null = null;
      for (const tp of tripPlaces) {
        if (selfAndAncestorIds.has(tp.tripLocationId)) {
          matchedTripPlace = tp;
          break;
        }
      }

      // Also check descendant direction: trip_place might be a child of the city
      if (!matchedTripPlace) {
        const descendants = getDescendantNames(tripLocations, city);
        for (const tp of tripPlaces) {
          const tpLoc = tripLocations.find((l: TripLocation) => l.id === tp.tripLocationId);
          if (tpLoc && descendants.has(tpLoc.name.toLowerCase())) {
            matchedTripPlace = tp;
            break;
          }
        }
      }

      if (matchedTripPlace) {
        // Add POI to the matched trip_place's holding day
        const holdingDay = itineraryDays.find(d => d.tripPlaceId === matchedTripPlace!.id);
        if (holdingDay) {
          const existing = holdingDay.activities || [];
          if (!existing.some(a => a.id === poi.id)) {
            await updateItineraryDay(holdingDay.id, {
              activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: poi.id, schedule_state: 'potential' as const }],
            });
          }
        }
      } else {
        // No matching trip_place — create one for the city
        let tripPlace = findTripPlaceByLocationId(tripPlaces, cityTripLoc.id);
        if (!tripPlace) {
          tripPlace = await createTripPlace(activeTrip.id, cityTripLoc.id, { sortOrder: tripPlaces.length, locationName: city });
          await reloadTripPlaces?.();
        }

        const existingDay = itineraryDays.find(d => d.tripPlaceId === tripPlace!.id);
        let holdingDay = existingDay;
        if (!holdingDay) {
          const dayNumber = tripPlaces.length + 1;
          const created = await createItineraryDay({
            tripId: activeTrip.id,
            dayNumber,
            tripPlaceId: tripPlace.id,
            accommodationOptions: [],
            activities: [],
            transportationSegments: [],
          });
          holdingDay = created;
        }
        const activities = holdingDay.activities || [];
        if (!activities.some(a => a.id === poi.id)) {
          await updateItineraryDay(holdingDay.id, {
            activities: [...activities, { order: activities.length + 1, type: 'poi' as const, id: poi.id, schedule_state: 'potential' as const }],
          });
        }
        await reloadLocations?.();

      }
      await refetchItinerary?.();
    } catch (e) {
      console.error('Failed to auto-assign POI to trip place:', e);
    }
  }, [activeTrip, isResearchMode, tripPlaces, tripLocations, itineraryDays, reloadLocations, reloadTripPlaces, refetchItinerary]);

  return { autoAssign, isResearchMode };
}
