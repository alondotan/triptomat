import { useCallback } from 'react';
import { usePOI } from '@/features/poi/POIContext';
import { useResearchAutoAssign } from '@/features/poi/useResearchAutoAssign';
import type { PointOfInterest, POIStatus } from '@/types/trip';

const LOCKED_STATUSES: POIStatus[] = ['planned', 'scheduled', 'booked', 'visited', 'skipped'];

/**
 * Unified heart/like toggle for POIs.
 * Toggles between 'suggested' and 'interested', and auto-assigns to a
 * research location when liking (if in research mode).
 */
export function useToggleLike() {
  const { updatePOI } = usePOI();
  const { autoAssign } = useResearchAutoAssign();

  const toggleLike = useCallback(async (poi: PointOfInterest) => {
    if (LOCKED_STATUSES.includes(poi.status)) return;
    const newStatus: POIStatus = poi.status === 'interested' ? 'suggested' : 'interested';
    await updatePOI({ ...poi, status: newStatus });
    if (newStatus === 'interested') autoAssign(poi);
  }, [updatePOI, autoAssign]);

  return { toggleLike };
}
