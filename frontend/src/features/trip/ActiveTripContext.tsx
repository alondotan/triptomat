import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trip } from '@/types/trip';
import { ExchangeRates, fetchExchangeRates } from '@/features/finance/exchangeRateService';
import { addTripLocation, findInFlatList, type TripLocation } from '@/features/trip/tripLocationService';
import type { TripPlace } from '@/types/trip';
import type { SiteNode } from '@/features/geodata/useCountrySites';
import { useTripList } from './TripListContext';
import { useUpdateTrip, useDeleteTrip } from './useTripQueries';
import { useTripLocations, useReloadTripLocations } from './useTripLocationsQuery';
import { useTripPlaces, useReloadTripPlaces } from './useTripPlacesQuery';
import { useSourceEmailMap } from './useSourceEmailMap';
import { queryKeys } from '@/shared/queries/keys';

/**
 * Active-trip context. Owns trip selection + per-trip metadata
 * (locations, places, exchange rates, email map).
 *
 * Data fetching is now backed by TanStack Query hooks. The legacy
 * `useActiveTrip()` API is preserved.
 *
 * `refreshKey` and `loadTripData` remain for backwards compat:
 *  - `loadTripData` invalidates all trip-scoped queries (manual refresh).
 *  - `refreshKey` is a counter that increments on `loadTripData` —
 *    historically watched by other contexts; with Query in place no domain
 *    context still consumes it but a couple of components do, so we keep it.
 */

interface ActiveTripContextType {
  activeTrip: Trip | null;
  exchangeRates: ExchangeRates | null;
  tripLocationTree: SiteNode[];
  tripLocations: TripLocation[];
  tripPlaces: TripPlace[];
  sourceEmailMap: Record<string, { permalink?: string; subject?: string }>;
  refreshKey: number;
  myRole: 'owner' | 'editor' | null;
  isLoading: boolean;
  isLoadingLocations: boolean;
  error: string | null;
  setActiveTrip: (id: string) => void;
  updateCurrentTrip: (updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteCurrentTrip: () => Promise<void>;
  loadTripData: (tripId: string) => Promise<void>;
  setExchangeRates: (rates: ExchangeRates | null) => void;
  addSiteToHierarchy: (siteName: string, parentSiteName?: string) => void;
  reloadLocations: () => Promise<void>;
  reloadTripPlaces: () => Promise<void>;
}

export const ActiveTripContext = createContext<ActiveTripContextType | undefined>(undefined);

export function ActiveTripProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { trips, activeTripId, isLoading, error, setActiveTripId } = useTripList();

  const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);
  const tripId = activeTrip?.id;

  // Trip locations + tree
  const { data: locationsData, isLoading: isLoadingLocations } = useTripLocations(tripId, activeTrip?.countries ?? []);
  const tripLocations = locationsData?.flat ?? [];
  const tripLocationTree = locationsData?.tree ?? [];
  const reloadLocationsFn = useReloadTripLocations(tripId);

  // Trip places
  const { data: tripPlaces = [] } = useTripPlaces(tripId);
  const reloadTripPlacesFn = useReloadTripPlaces(tripId);

  // Source email map
  const { data: sourceEmailMap = {} } = useSourceEmailMap(tripId);

  // Exchange rates — keyed by currency + countries
  const { data: exchangeRatesData = null } = useQuery<ExchangeRates | null>({
    queryKey: ['exchange-rates', activeTrip?.currency, activeTrip?.countries?.slice().sort().join(',')],
    enabled: !!activeTrip,
    queryFn: () => fetchExchangeRates(activeTrip!.currency, activeTrip!.countries),
    staleTime: 30 * 60_000,
  });
  // Allow manual override (for the "fill missing rate on demand" path in formatDualCurrency)
  const [exchangeRatesOverride, setExchangeRatesOverride] = useState<ExchangeRates | null>(null);
  const exchangeRates = exchangeRatesOverride ?? exchangeRatesData;

  // Reset override when trip changes
  useEffect(() => { setExchangeRatesOverride(null); }, [tripId]);

  // Trip mutations
  const updateMutation = useUpdateTrip();
  const deleteMutation = useDeleteTrip();

  // Refresh-key + manual reload
  const [refreshKey, setRefreshKey] = useState(0);

  const loadTripData = useCallback(async (id: string) => {
    // Invalidate all trip-scoped queries
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.locations(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.places(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.poi.all(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.transport.all(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.missions.all(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(id) }),
      queryClient.invalidateQueries({ queryKey: ['trips', id, 'source-email-map'] }),
    ]);
    setRefreshKey(k => k + 1);
  }, [queryClient]);

  const setActiveTrip = useCallback((id: string) => {
    setActiveTripId(id);
    // Track last-opened timestamp for "recent trips" ordering
    try {
      const stored = JSON.parse(localStorage.getItem('trip_last_opened') || '{}');
      stored[id] = Date.now();
      localStorage.setItem('trip_last_opened', JSON.stringify(stored));
    } catch { /* ignore */ }
  }, [setActiveTripId]);

  const updateCurrentTrip = useCallback(async (updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>>) => {
    if (!activeTrip) return;
    try {
      await updateMutation.mutateAsync({ id: activeTrip.id, updates });
    } catch { /* toast handled inside mutation */ }
  }, [activeTrip, updateMutation]);

  const deleteCurrentTrip = useCallback(async () => {
    if (!activeTrip) return;
    try {
      await deleteMutation.mutateAsync(activeTrip.id);
    } catch { /* toast handled inside mutation */ }
  }, [activeTrip, deleteMutation]);

  const setExchangeRates = useCallback((rates: ExchangeRates | null) => {
    setExchangeRatesOverride(rates);
  }, []);

  const reloadLocations = useCallback(async () => {
    if (tripId) await reloadLocationsFn();
  }, [tripId, reloadLocationsFn]);

  const reloadTripPlaces = useCallback(async () => {
    if (tripId) await reloadTripPlacesFn();
  }, [tripId, reloadTripPlacesFn]);

  const addSiteToHierarchy = useCallback((siteName: string, parentSiteName?: string) => {
    if (!activeTrip) return;
    if (findInFlatList(tripLocations, siteName)) return;

    let parentId: string | null = null;
    if (parentSiteName) {
      const parent = findInFlatList(tripLocations, parentSiteName);
      if (parent) parentId = parent.id;
    }

    addTripLocation(activeTrip.id, siteName, 'city', parentId, 'manual')
      .then(() => reloadLocationsFn())
      .catch(e => console.error('Failed to add location:', e));
  }, [activeTrip, tripLocations, reloadLocationsFn]);

  const myRole = activeTrip?.myRole ?? null;

  const value = useMemo(() => ({
    activeTrip,
    exchangeRates,
    tripLocationTree,
    tripLocations,
    tripPlaces,
    sourceEmailMap,
    refreshKey,
    myRole,
    isLoading,
    isLoadingLocations,
    error,
    setActiveTrip,
    updateCurrentTrip,
    deleteCurrentTrip,
    loadTripData,
    setExchangeRates,
    addSiteToHierarchy,
    reloadLocations,
    reloadTripPlaces,
  }), [activeTrip, exchangeRates, tripLocationTree, tripLocations, tripPlaces, sourceEmailMap, refreshKey, myRole, isLoading, isLoadingLocations, error, setActiveTrip, updateCurrentTrip, deleteCurrentTrip, loadTripData, setExchangeRates, addSiteToHierarchy, reloadLocations, reloadTripPlaces]);

  return <ActiveTripContext.Provider value={value}>{children}</ActiveTripContext.Provider>;
}

export function useActiveTrip() {
  const context = useContext(ActiveTripContext);
  if (!context) throw new Error('useActiveTrip must be used within an ActiveTripProvider');
  return context;
}
