import { useCallback, useContext } from 'react';
import { ActiveTripContext } from '@/context/ActiveTripContext';
import { ItineraryContext } from '@/context/ItineraryContext';
import { POIContext } from '@/context/POIContext';
import { getDescendantNames, type TripLocation } from '@/services/tripLocationService';
import { findOrCreateItineraryLocation, assignDayToLocation, updateItineraryLocationImage } from '@/services/itineraryLocationService';
import { createItineraryDay, updateItineraryDay } from '@/services/itineraryService';
import type { PointOfInterest } from '@/types/trip';

/**
 * In research mode, auto-assigns a POI to the matching research location when liked.
 * Searches the trip location hierarchy for a match (ancestor or descendant),
 * or creates a new research location for the POI's city.
 * Safe to use outside of providers (returns a no-op).
 */
export function useResearchAutoAssign() {
  const tripCtx = useContext(ActiveTripContext);
  const itinCtx = useContext(ItineraryContext);
  const poiCtx = useContext(POIContext);

  const activeTrip = tripCtx?.activeTrip;
  const tripLocations = tripCtx?.tripLocations ?? [];
  const pois = poiCtx?.pois ?? [];
  const itineraryLocations = itinCtx?.itineraryLocations ?? [];
  const itineraryDays = itinCtx?.itineraryDays ?? [];
  const refetchItineraryLocations = itinCtx?.refetchItineraryLocations;
  const refetchItinerary = itinCtx?.refetchItinerary;

  const isResearchMode = activeTrip?.status === 'research';

  const researchLocations = itineraryLocations.filter(il => !il.isDefault);

  // Fire-and-forget: find an image for the new research location
  const fetchLocationImage = useCallback(async (locationName: string, tripLoc: TripLocation, itinLocId: string) => {
    try {
      let imageUrl: string | null = null;
      const locName = locationName.toLowerCase();
      const nameParts = [locName, ...locName.split(/\s*[&,\-–]\s*/).map(s => s.trim()).filter(Boolean)];

      // 1. Try POIs whose city matches
      for (const part of nameParts) {
        const match = pois.find(p => p.imageUrl && p.location?.city?.toLowerCase() === part);
        if (match) { imageUrl = match.imageUrl!; break; }
      }

      // 2. Try child locations in the hierarchy
      if (!imageUrl) {
        const childLocs = tripLocations.filter(tl => tl.parentId === tripLoc.id);
        for (const child of childLocs) {
          const match = pois.find(p => p.imageUrl && p.location?.city?.toLowerCase() === child.name.toLowerCase());
          if (match) { imageUrl = match.imageUrl!; break; }
        }
      }

      // 3. Fallback: Wikipedia
      if (!imageUrl) {
        const wikiName = nameParts[0] || locationName;
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`);
        if (res.ok) {
          const data = await res.json();
          imageUrl = data?.originalimage?.source || data?.thumbnail?.source || null;
        }
      }

      if (imageUrl) {
        await updateItineraryLocationImage(itinLocId, imageUrl);
        await refetchItineraryLocations?.();
      }
    } catch { /* silent */ }
  }, [pois, tripLocations, refetchItineraryLocations]);

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
        await refetchItineraryLocations?.();

        // Fetch and persist location image in the background
        if (!itinLoc.imageUrl) {
          fetchLocationImage(city, cityTripLoc, itinLoc.id);
        }
      }
      await refetchItinerary?.();
    } catch (e) {
      console.error('Failed to auto-assign POI to research location:', e);
    }
  }, [activeTrip, isResearchMode, researchLocations, tripLocations, itineraryDays, refetchItineraryLocations, refetchItinerary, fetchLocationImage]);

  return { autoAssign, isResearchMode };
}
