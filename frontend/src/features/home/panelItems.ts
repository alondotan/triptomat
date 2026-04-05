import type { DraftDay } from '@/types/itineraryDraft';
import type { PointOfInterest } from '@/types/trip';
import type { ChatSuggestion } from './chatSuggestions';

export interface PanelItem {
  id: string;
  name: string;
  category?: string;
  imageUrl?: string;
  coordinates?: [number, number];
  /** Set when this item is linked to a real PointOfInterest in the DB */
  poiId?: string;
  /** Full POI object when available — used to open the POI detail dialog */
  poi?: PointOfInterest;
  dayNumber?: number;
  locationName?: string;
  /** True while the backing POI is still being created (brief lag after set_itinerary) */
  isTemporary?: boolean;
}

export type SelectedLevel =
  | { type: 'trip' }
  | { type: 'location'; name: string }
  | { type: 'day'; dayNumber: number }
  | { type: 'activity'; name: string };

export type ContextMode = 'itinerary' | 'recommendation' | 'empty';

/** Derive PanelItems from the live itinerary, filtered by the selected tree level. */
export function panelItemsFromItinerary(
  liveDays: DraftDay[],
  pois: PointOfInterest[],
  selectedLevel: SelectedLevel,
): PanelItem[] {
  const poiMap = new Map(pois.map(p => [p.id, p]));

  // Filter days according to selected level
  let filteredDays: DraftDay[];
  if (selectedLevel.type === 'trip') {
    filteredDays = liveDays;
  } else if (selectedLevel.type === 'location') {
    filteredDays = liveDays.filter(d => d.locationContext === selectedLevel.name);
  } else if (selectedLevel.type === 'day') {
    filteredDays = liveDays.filter(d => d.dayNumber === selectedLevel.dayNumber);
  } else {
    // activity — single place by name
    const name = selectedLevel.name.toLowerCase();
    filteredDays = liveDays
      .map(d => ({
        ...d,
        places: d.places.filter(p => p.name.toLowerCase() === name),
      }))
      .filter(d => d.places.length > 0);
  }

  const items: PanelItem[] = [];
  for (const day of filteredDays) {
    for (const place of day.places) {
      const poi = place.existingPoiId ? poiMap.get(place.existingPoiId) : undefined;
      if (poi) {
        const coords = poi.location?.coordinates
          ? [poi.location.coordinates.lat, poi.location.coordinates.lng] as [number, number]
          : undefined;
        items.push({
          id: poi.id,
          name: poi.name,
          category: poi.category,
          imageUrl: poi.imageUrl,
          coordinates: coords,
          poiId: poi.id,
          poi,
          dayNumber: day.dayNumber,
          locationName: day.locationContext,
        });
      } else {
        // POI not yet in local cache (brief realtime lag)
        items.push({
          id: `tmp-${day.dayNumber}-${place.name}`,
          name: place.name,
          category: place.category,
          dayNumber: day.dayNumber,
          locationName: day.locationContext,
          isTemporary: true,
        });
      }
    }
  }
  return items;
}

/** Derive PanelItems from AI suggestions, enriching with real POI data where name matches. */
export function panelItemsFromSuggestions(
  suggestions: ChatSuggestion[],
  pois: PointOfInterest[],
  placeImageMap: Map<string, string>,
  placeCoordMap: Map<string, [number, number]>,
): PanelItem[] {
  return suggestions.map(s => {
    const nameLower = s.name.toLowerCase();
    const poi = pois.find(p => p.name.toLowerCase() === nameLower);
    if (poi) {
      const coords = poi.location?.coordinates
        ? [poi.location.coordinates.lat, poi.location.coordinates.lng] as [number, number]
        : s.coordinates ?? placeCoordMap.get(nameLower);
      return {
        id: s.id,
        name: poi.name,
        category: poi.category,
        imageUrl: poi.imageUrl,
        coordinates: coords,
        poiId: poi.id,
        poi,
        locationName: s.location,
      };
    }
    // No matching POI — use geodata fallback
    return {
      id: s.id,
      name: s.name,
      imageUrl: placeImageMap.get(nameLower),
      coordinates: s.coordinates ?? placeCoordMap.get(nameLower),
      locationName: s.location,
      isTemporary: true,
    };
  });
}
