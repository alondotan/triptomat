import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trip, TripStatus } from '@/types/trip';
import { useTrips, useCreateTrip } from './useTripQueries';
import { queryKeys } from '@/shared/queries/keys';

export interface CreateTripData {
  name: string;
  description?: string;
  countries: string[];
  currency?: string;
  status: TripStatus;
  numberOfDays?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * TripListContext owns the *active trip selection* (which trip the user is
 * currently viewing). The trip list itself is backed by TanStack Query
 * (`useTrips`) — this context just adds the active-trip-id selection layer
 * on top, with localStorage persistence and graceful fallback when the
 * active trip disappears.
 *
 * `removeTrip` / `updateTripInList` are kept for backwards compatibility but
 * are now thin wrappers around the query cache. New code should use the
 * mutation hooks in `useTripQueries.ts` directly.
 */

interface TripListContextType {
  trips: Trip[];
  activeTripId: string | null;
  isLoading: boolean;
  error: string | null;
  loadTrips: () => Promise<void>;
  setActiveTripId: (id: string) => void;
  createNewTrip: (data: CreateTripData) => Promise<void>;
  removeTrip: (id: string) => void;
  updateTripInList: (updates: Partial<Trip> & { id: string }) => void;
}

const TripListContext = createContext<TripListContextType | undefined>(undefined);

export function TripListProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: trips = [], isLoading, error: queryError } = useTrips();
  const createMutation = useCreateTrip();

  const [activeTripId, setActiveTripIdState] = useState<string | null>(() => {
    return localStorage.getItem('activeTripId');
  });

  // When trips load (or change), if no active trip is selected — or the
  // selected one no longer exists — fall back to the first trip.
  useEffect(() => {
    if (trips.length === 0) return;
    if (!activeTripId || !trips.some(t => t.id === activeTripId)) {
      const fallbackId = trips[0].id;
      setActiveTripIdState(fallbackId);
      localStorage.setItem('activeTripId', fallbackId);
    }
  }, [trips, activeTripId]);

  const setActiveTripId = useCallback((id: string) => {
    localStorage.setItem('activeTripId', id);
    setActiveTripIdState(id);
  }, []);

  const loadTrips = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.trips.list() });
  }, [queryClient]);

  const createNewTrip = useCallback(async (data: CreateTripData) => {
    try {
      const newTrip = await createMutation.mutateAsync({
        name: data.name,
        description: data.description,
        countries: data.countries,
        currency: (data.currency || 'ILS') as Trip['currency'],
        status: data.status,
        numberOfDays: data.numberOfDays,
        startDate: data.startDate,
        endDate: data.endDate,
      });
      localStorage.setItem('activeTripId', newTrip.id);
      setActiveTripIdState(newTrip.id);
    } catch { /* toast handled inside mutation */ }
  }, [createMutation]);

  /**
   * Removes a trip from the local cache. Does NOT call the DB — assumes the
   * caller already deleted the trip (or is using a mutation that did).
   * Also reassigns `activeTripId` if the removed trip was active.
   */
  const removeTrip = useCallback((id: string) => {
    queryClient.setQueryData<Trip[]>(queryKeys.trips.list(), (old) => (old ?? []).filter(t => t.id !== id));
    if (activeTripId === id) {
      const remaining = (queryClient.getQueryData<Trip[]>(queryKeys.trips.list()) ?? []);
      const fallbackId = remaining.length > 0 ? remaining[0].id : null;
      if (fallbackId) {
        localStorage.setItem('activeTripId', fallbackId);
      } else {
        localStorage.removeItem('activeTripId');
      }
      setActiveTripIdState(fallbackId);
    }
  }, [queryClient, activeTripId]);

  /**
   * Patches a trip in the local cache. Does NOT call the DB.
   */
  const updateTripInList = useCallback((updates: Partial<Trip> & { id: string }) => {
    queryClient.setQueryData<Trip[]>(queryKeys.trips.list(), (old) =>
      (old ?? []).map(t => t.id === updates.id ? { ...t, ...updates } : t),
    );
  }, [queryClient]);

  const value = useMemo(() => ({
    trips,
    activeTripId,
    isLoading,
    error: queryError ? 'Failed to load trips' : null,
    loadTrips,
    setActiveTripId,
    createNewTrip,
    removeTrip,
    updateTripInList,
  }), [trips, activeTripId, isLoading, queryError, loadTrips, setActiveTripId, createNewTrip, removeTrip, updateTripInList]);

  return <TripListContext.Provider value={value}>{children}</TripListContext.Provider>;
}

export function useTripList() {
  const context = useContext(TripListContext);
  if (!context) throw new Error('useTripList must be used within a TripListProvider');
  return context;
}
