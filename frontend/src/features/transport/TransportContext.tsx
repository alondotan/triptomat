import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { Transportation } from '@/types/trip';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import {
  useTransportation,
  useAddTransportation,
  useUpdateTransportation,
  useDeleteTransportation,
  useMergeTransportation,
} from './useTransportQueries';

/**
 * Thin wrapper around the Transport TanStack Query hooks. Preserves the legacy
 * `useTransport()` API. New code should prefer the hooks in
 * `useTransportQueries.ts` directly.
 */

interface TransportContextType {
  transportation: Transportation[];
  addTransportation: (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Transportation | undefined>;
  updateTransportation: (t: Transportation) => Promise<void>;
  deleteTransportation: (id: string) => Promise<void>;
  mergeTransportation: (primaryId: string, secondaryId: string) => Promise<void>;
}

const TransportContext = createContext<TransportContextType | undefined>(undefined);

export function TransportProvider({ children }: { children: ReactNode }) {
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const { data: transportation = [] } = useTransportation(tripId);
  const addMutation = useAddTransportation(tripId);
  const updateMutation = useUpdateTransportation(tripId);
  const deleteMutation = useDeleteTransportation(tripId);
  const mergeMutation = useMergeTransportation(tripId);

  const addTransportation = useCallback(
    async (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        return await addMutation.mutateAsync(t);
      } catch {
        return undefined;
      }
    },
    [addMutation],
  );

  const updateTransportation = useCallback(
    async (t: Transportation) => {
      try {
        await updateMutation.mutateAsync(t);
      } catch { /* toast handled inside mutation */ }
    },
    [updateMutation],
  );

  const deleteTransportation = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync(id);
      } catch { /* toast handled inside mutation */ }
    },
    [deleteMutation],
  );

  const mergeTransportation = useCallback(
    async (primaryId: string, secondaryId: string) => {
      const primary = transportation.find(t => t.id === primaryId);
      const secondary = transportation.find(t => t.id === secondaryId);
      if (!primary || !secondary) return;
      try {
        await mergeMutation.mutateAsync({ primary, secondary });
      } catch { /* toast handled inside mutation */ }
    },
    [transportation, mergeMutation],
  );

  const value = useMemo(
    () => ({ transportation, addTransportation, updateTransportation, deleteTransportation, mergeTransportation }),
    [transportation, addTransportation, updateTransportation, deleteTransportation, mergeTransportation],
  );

  return <TransportContext.Provider value={value}>{children}</TransportContext.Provider>;
}

export function useTransport() {
  const context = useContext(TransportContext);
  if (!context) throw new Error('useTransport must be used within a TransportProvider');
  return context;
}
