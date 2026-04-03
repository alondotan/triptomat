import { useRef, useState, useCallback } from 'react';
import type { ItineraryDay, PointOfInterest } from '@/types/trip';
import type { DraftDay, DraftPlace } from '@/types/itineraryDraft';

const CATEGORY_MAP: Record<string, DraftPlace['category']> = {
  accommodation: 'accommodation',
  eatery: 'eatery',
  attraction: 'attraction',
  service: 'service',
  event: 'event',
};

/** Serialize the current real itinerary into a DraftDay[] snapshot. */
function buildSnapshot(itineraryDays: ItineraryDay[], pois: PointOfInterest[]): DraftDay[] {
  const poiMap = new Map(pois.map(p => [p.id, p]));
  return itineraryDays.map(day => ({
    dayNumber: day.dayNumber,
    date: day.date,
    locationContext: day.locationContext,
    places: (day.activities ?? [])
      .filter(a => a.type === 'poi' && poiMap.has(a.id))
      .sort((a, b) => a.order - b.order)
      .map(a => {
        const poi = poiMap.get(a.id)!;
        return {
          name: poi.name,
          category: CATEGORY_MAP[poi.category] ?? 'attraction',
          city: poi.location?.city,
          existingPoiId: a.id,
          time: a.time_window?.start,
        };
      }),
  }));
}

/**
 * Manages itinerary history for the instant-apply chat mode.
 * - takeBackup: snapshot at conversation start (call before first message)
 * - pushHistory: snapshot before each AI itinerary update (for undo)
 * - undo: pop last snapshot, returns it for re-applying
 * - restore: returns the backup snapshot (pre-conversation state)
 * - reset: clears everything (e.g. when chat is cleared)
 */
export function useItineraryHistory() {
  const historyRef = useRef<DraftDay[][]>([]);
  const backupRef = useRef<DraftDay[] | null>(null);
  // State-tracked counters drive UI re-renders
  const [historyLength, setHistoryLength] = useState(0);
  const [hasBackup, setHasBackup] = useState(false);

  const takeBackup = useCallback((itineraryDays: ItineraryDay[], pois: PointOfInterest[]) => {
    if (backupRef.current !== null) return; // already taken
    backupRef.current = buildSnapshot(itineraryDays, pois);
    setHasBackup(true);
  }, []);

  const pushHistory = useCallback((itineraryDays: ItineraryDay[], pois: PointOfInterest[]) => {
    historyRef.current.push(buildSnapshot(itineraryDays, pois));
    setHistoryLength(historyRef.current.length);
  }, []);

  const undo = useCallback((): DraftDay[] | null => {
    const snapshot = historyRef.current.pop() ?? null;
    setHistoryLength(historyRef.current.length);
    return snapshot;
  }, []);

  const restore = useCallback((): DraftDay[] | null => {
    return backupRef.current;
  }, []);

  const reset = useCallback(() => {
    historyRef.current = [];
    backupRef.current = null;
    setHistoryLength(0);
    setHasBackup(false);
  }, []);

  return {
    takeBackup,
    pushHistory,
    undo,
    restore,
    reset,
    canUndo: historyLength > 0,
    canRestore: hasBackup,
  };
}
