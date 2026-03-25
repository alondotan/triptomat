import { useCallback } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useItinerary } from '@/context/ItineraryContext';
import { getDescendantNames } from '@/services/tripLocationService';
import { findOrCreateItineraryLocation, assignDayToLocation } from '@/services/itineraryLocationService';
import { createItineraryDay, updateItineraryDay } from '@/services/itineraryService';
import type { PointOfInterest } from '@/types/trip';

/**
 * In research mode, auto-assigns a POI to the matching research location when liked.
 * Searches the trip location hierarchy for a match (ancestor or descendant),
 * or creates a new research location for the POI's city.
 */
export function useResearchAutoAssign() {
  const { activeTrip, tripLocations } = useActiveTrip();
  const { itineraryLocations, itineraryDays, refetchItineraryLocations, refetchItinerary } = useItinerary();

  const isResearchMode = activeTrip?.status === 'research';

  const researchLocations = itineraryLocations.filter(il => !il.isDefault);

  const autoAssign = useCallback(async (poi: PointOfInterest) => {
    if (!activeTrip || !isResearchMode) return;
    const city = poi.location?.city;
    if (!city) return;
    const cityLower = city.toLowerCase();

    try {
      // Find the POI's city in the trip location hierarchy
      const cityTripLoc = tripLocations.find(l => l.name.toLowerCase() === cityLower);
      if (!cityTripLoc) return;

      // Collect the city + all its ancestors (e.g. Beijing -> North China -> China)
      const selfAndAncestorIds = new Set<string>();
      let current = cityTripLoc;
      while (current) {
        selfAndAncestorIds.add(current.id);
        if (!current.parentId) break;
        const parent = tripLocations.find(l => l.id === current.parentId);
        if (!parent) break;
        current = parent;
      }

      // Check if any existing research location matches (is the city itself or an ancestor)
      let matchedItinLocId: string | null = null;
      for (const il of researchLocations) {
        if (il.tripLocationId && selfAndAncestorIds.has(il.tripLocationId)) {
          matchedItinLocId = il.id;
          break;
        }
      }

      // Also check descendant direction: research location might be a child of the city
      if (!matchedItinLocId) {
        const descendants = getDescendantNames(tripLocations, city);
        for (const il of researchLocations) {
          if (!il.tripLocationId) continue;
          const tl = tripLocations.find(l => l.id === il.tripLocationId);
          if (tl && descendants.has(tl.name.toLowerCase())) {
            matchedItinLocId = il.id;
            break;
          }
        }
      }

      if (matchedItinLocId) {
        // Add POI to the matched research location's holding day
        const holdingDay = itineraryDays.find(d => d.itineraryLocationId === matchedItinLocId);
        if (holdingDay) {
          const existing = holdingDay.activities || [];
          if (!existing.some(a => a.id === poi.id)) {
            await updateItineraryDay(holdingDay.id, {
              activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: poi.id, schedule_state: 'potential' as const }],
            });
          }
        }
      } else {
        // No matching research location — create one for the POI's city
        const itinLoc = await findOrCreateItineraryLocation(activeTrip.id, cityTripLoc.id);
        const existingDay = itineraryDays.find(d => d.itineraryLocationId === itinLoc.id);
        let holdingDay = existingDay;
        if (!holdingDay) {
          const dayNumber = researchLocations.length + 1;
          const created = await createItineraryDay({
            tripId: activeTrip.id,
            dayNumber,
            locationContext: city,
            accommodationOptions: [],
            activities: [],
            transportationSegments: [],
          });
          await assignDayToLocation(created.id, itinLoc.id);
          holdingDay = created;
        }
        const activities = holdingDay.activities || [];
        if (!activities.some(a => a.id === poi.id)) {
          await updateItineraryDay(holdingDay.id, {
            activities: [...activities, { order: activities.length + 1, type: 'poi' as const, id: poi.id, schedule_state: 'potential' as const }],
          });
        }
        await refetchItineraryLocations();
      }
      await refetchItinerary();
    } catch (e) {
      console.error('Failed to auto-assign POI to research location:', e);
    }
  }, [activeTrip, isResearchMode, researchLocations, tripLocations, itineraryDays, refetchItineraryLocations, refetchItinerary]);

  return { autoAssign, isResearchMode };
}
