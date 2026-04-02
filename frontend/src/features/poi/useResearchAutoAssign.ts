import { useCallback, useContext } from 'react';
import { ActiveTripContext } from '@/features/trip/ActiveTripContext';
import { ItineraryContext } from '@/features/itinerary/ItineraryContext';
import { POIContext } from '@/features/poi/POIContext';
import { getDescendantNames, updateTripLocationImage, markTripLocationPlanned, type TripLocation } from '@/features/trip/tripLocationService';
import { createItineraryDay, updateItineraryDay } from '@/features/itinerary/itineraryService';
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
  const reloadLocations = tripCtx?.reloadLocations;
  const pois = poiCtx?.pois ?? [];
  const itineraryDays = itinCtx?.itineraryDays ?? [];
  const refetchItinerary = itinCtx?.refetchItinerary;

  const isResearchMode = activeTrip?.status === 'research';

  const researchLocations = tripLocations.filter(tl => !tl.isTemporary && tl.isPlanned);

  // Fire-and-forget: find an image for the new research location
  const fetchLocationImage = useCallback(async (locationName: string, tripLoc: TripLocation) => {
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
        await updateTripLocationImage(tripLoc.id, imageUrl);
        await reloadLocations?.();
      }
    } catch { /* silent */ }
  }, [pois, tripLocations, reloadLocations]);

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
      let matchedTripLocId: string | null = null;
      for (const tl of researchLocations) {
        if (selfAndAncestorIds.has(tl.id)) {
          matchedTripLocId = tl.id;
          break;
        }
      }

      // Also check descendant direction: research location might be a child of the city
      if (!matchedTripLocId) {
        const descendants = getDescendantNames(tripLocations, city);
        for (const tl of researchLocations) {
          if (descendants.has(tl.name.toLowerCase())) {
            matchedTripLocId = tl.id;
            break;
          }
        }
      }

      if (matchedTripLocId) {
        // Add POI to the matched research location's holding day
        const holdingDay = itineraryDays.find(d => d.tripLocationId === matchedTripLocId);
        if (holdingDay) {
          const existing = holdingDay.activities || [];
          if (!existing.some(a => a.id === poi.id)) {
            await updateItineraryDay(holdingDay.id, {
              activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: poi.id, schedule_state: 'potential' as const }],
            });
          }
        }
      } else {
        // No matching research location — use the city trip_location directly as research location
        const existingDay = itineraryDays.find(d => d.tripLocationId === cityTripLoc.id);
        let holdingDay = existingDay;
        if (!holdingDay) {
          const dayNumber = researchLocations.length + 1;
          const created = await createItineraryDay({
            tripId: activeTrip.id,
            dayNumber,
            locationContext: city,
            tripLocationId: cityTripLoc.id,
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
        await markTripLocationPlanned(cityTripLoc.id, true);
        await reloadLocations?.();

        // Fetch and persist location image in the background
        if (!cityTripLoc.imageUrl) {
          fetchLocationImage(city, cityTripLoc);
        }
      }
      await refetchItinerary?.();
    } catch (e) {
      console.error('Failed to auto-assign POI to research location:', e);
    }
  }, [activeTrip, isResearchMode, researchLocations, tripLocations, itineraryDays, reloadLocations, refetchItinerary, fetchLocationImage]);

  return { autoAssign, isResearchMode };
}
