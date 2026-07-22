import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { PointOfInterest } from '@/types/trip';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOIs, useAddPOI, useUpdatePOI, useDeletePOI, useMergePOIs } from './usePOIQueries';

/**
 * Thin wrapper around the POI TanStack Query hooks. Preserves the legacy
 * `usePOI()` API so existing consumers don't need to change. New code should
 * prefer the hooks in `usePOIQueries.ts` directly.
 */

interface POIContextType {
  pois: PointOfInterest[];
  addPOI: (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PointOfInterest | undefined>;
  updatePOI: (poi: PointOfInterest) => Promise<void>;
  deletePOI: (poiId: string) => Promise<void>;
  mergePOIs: (primaryId: string, secondaryId: string) => Promise<void>;
}

export const POIContext = createContext<POIContextType | undefined>(undefined);

export function POIProvider({ children }: { children: ReactNode }) {
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const { data: pois = [] } = usePOIs(tripId);
  const addMutation = useAddPOI(tripId);
  const updateMutation = useUpdatePOI(tripId);
  const deleteMutation = useDeletePOI(tripId);
  const mergeMutation = useMergePOIs(tripId);

  const addPOI = useCallback(
    async (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        const result = await addMutation.mutateAsync(poi);
        return result.poi;
      } catch {
        return undefined;
      }
    },
    [addMutation],
  );

  const updatePOI = useCallback(
    async (poi: PointOfInterest) => {
      try {
        await updateMutation.mutateAsync(poi);
      } catch {
        // toast handled inside mutation
      }
    },
    [updateMutation],
  );

  const deletePOI = useCallback(
    async (poiId: string) => {
      try {
        await deleteMutation.mutateAsync(poiId);
      } catch {
        // toast handled inside mutation
      }
    },
    [deleteMutation],
  );

  const mergePOIs = useCallback(
    async (primaryId: string, secondaryId: string) => {
      const primary = pois.find(p => p.id === primaryId);
      const secondary = pois.find(p => p.id === secondaryId);
      if (!primary || !secondary) return;
      try {
        await mergeMutation.mutateAsync({ primary, secondary });
      } catch {
        // toast handled inside mutation
      }
    },
    [pois, mergeMutation],
  );

  const value = useMemo(
    () => ({ pois, addPOI, updatePOI, deletePOI, mergePOIs }),
    [pois, addPOI, updatePOI, deletePOI, mergePOIs],
  );

  return <POIContext.Provider value={value}>{children}</POIContext.Provider>;
}

export function usePOI() {
  const context = useContext(POIContext);
  if (!context) throw new Error('usePOI must be used within a POIProvider');
  return context;
}
