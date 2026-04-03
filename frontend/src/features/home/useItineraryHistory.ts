import { useRef, useState, useCallback } from 'react';
import type { ItineraryDay, PointOfInterest, Trip } from '@/types/trip';
import type { DraftDay } from '@/types/itineraryDraft';
import { CATEGORY_MAP } from '@/shared/utils/categoryMap';

export interface TripMeta {
  numberOfDays?: number;
  startDate?: string;
  endDate?: string;
}

export interface ItinerarySnapshot {
  days: DraftDay[];
  tripMeta: TripMeta;
}

/** Serialize the current real itinerary + trip metadata into a snapshot. */
function buildSnapshot(itineraryDays: ItineraryDay[], pois: PointOfInterest[], trip?: Pick<Trip, 'numberOfDays' | 'startDate' | 'endDate'> | null): ItinerarySnapshot {
  const poiMap = new Map(pois.map(p => [p.id, p]));
  const days = itineraryDays.map(day => ({
    dayNumber: day.dayNumber,
    date: day.date,
    locationContext: (day as ItineraryDay & { locationContext?: string }).locationContext,
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
  return {
    days,
    tripMeta: {
      numberOfDays: trip?.numberOfDays ?? undefined,
      startDate: trip?.startDate ?? undefined,
      endDate: trip?.endDate ?? undefined,
    },
  };
}

/**
 * Manages itinerary history for the instant-apply chat mode.
 * - takeBackup: snapshot at conversation start (call before first message)
 * - pushHistory: snapshot before each AI write operation (for undo)
 * - undo: pop last snapshot, returns it for re-applying
 * - restore: returns the backup snapshot (pre-conversation state)
 * - reset: clears everything (e.g. when chat is cleared)
 */
export function useItineraryHistory() {
  const historyRef = useRef<ItinerarySnapshot[]>([]);
  const backupRef = useRef<ItinerarySnapshot | null>(null);
  // State-tracked counters drive UI re-renders
  const [historyLength, setHistoryLength] = useState(0);
  const [hasBackup, setHasBackup] = useState(false);

  const takeBackup = useCallback((itineraryDays: ItineraryDay[], pois: PointOfInterest[], trip?: Pick<Trip, 'numberOfDays' | 'startDate' | 'endDate'> | null) => {
    if (backupRef.current !== null) return; // already taken
    backupRef.current = buildSnapshot(itineraryDays, pois, trip);
    setHasBackup(true);
  }, []);

  const pushHistory = useCallback((itineraryDays: ItineraryDay[], pois: PointOfInterest[], trip?: Pick<Trip, 'numberOfDays' | 'startDate' | 'endDate'> | null) => {
    historyRef.current.push(buildSnapshot(itineraryDays, pois, trip));
    setHistoryLength(historyRef.current.length);
  }, []);

  const undo = useCallback((): ItinerarySnapshot | null => {
    const snapshot = historyRef.current.pop() ?? null;
    setHistoryLength(historyRef.current.length);
    return snapshot;
  }, []);

  const restore = useCallback((): ItinerarySnapshot | null => {
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
