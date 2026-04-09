import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Trip } from '@/types/trip';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { updateTrip, deleteTrip } from '@/features/trip/tripService';
import { ExchangeRates, fetchExchangeRates } from '@/features/finance/exchangeRateService';

import { fetchTripLocations, buildLocationTree, loadCountryData, buildDescriptionMap, addTripLocation, findInFlatList, type TripLocation } from '@/features/trip/tripLocationService';
import { fetchTripPlaces, type TripPlace } from '@/features/trip/tripPlaceService';
import type { SiteNode } from '@/features/geodata/useCountrySites';
import { useToast } from '@/shared/hooks/use-toast';
import { useTripList } from './TripListContext';

// State
interface ActiveTripState {
  exchangeRates: ExchangeRates | null;
  tripLocations: TripLocation[];
  tripLocationTree: SiteNode[];
  tripPlaces: TripPlace[];
  sourceEmailMap: Record<string, { permalink?: string; subject?: string }>;
  refreshKey: number;
  myRole: 'owner' | 'editor' | null;
}

type ActiveTripAction =
  | { type: 'SET_EXCHANGE_RATES'; payload: ExchangeRates | null }
  | { type: 'SET_TRIP_LOCATIONS'; payload: { flat: TripLocation[]; tree: SiteNode[] } }
  | { type: 'SET_TRIP_PLACES'; payload: TripPlace[] }
  | { type: 'SET_SOURCE_EMAIL_MAP'; payload: Record<string, { permalink?: string; subject?: string }> }
  | { type: 'SET_MY_ROLE'; payload: 'owner' | 'editor' | null }
  | { type: 'INCREMENT_REFRESH_KEY' }
  | { type: 'RESET_TRIP_DATA' };

function activeTripReducer(state: ActiveTripState, action: ActiveTripAction): ActiveTripState {
  switch (action.type) {
    case 'SET_EXCHANGE_RATES':
      return { ...state, exchangeRates: action.payload };
    case 'SET_TRIP_LOCATIONS':
      return { ...state, tripLocations: action.payload.flat, tripLocationTree: action.payload.tree };
    case 'SET_TRIP_PLACES':
      return { ...state, tripPlaces: action.payload };
    case 'SET_SOURCE_EMAIL_MAP':
      return { ...state, sourceEmailMap: action.payload };
    case 'SET_MY_ROLE':
      return { ...state, myRole: action.payload };
    case 'INCREMENT_REFRESH_KEY':
      return { ...state, refreshKey: state.refreshKey + 1 };
    case 'RESET_TRIP_DATA':
      return { ...state, exchangeRates: null, tripLocations: [], tripLocationTree: [], tripPlaces: [], sourceEmailMap: {}, myRole: null, refreshKey: state.refreshKey + 1 };
    default:
      return state;
  }
}

// Context type
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
  const { toast } = useToast();
  const { trips, activeTripId, isLoading, error, setActiveTripId, removeTrip, updateTripInList } = useTripList();

  const [state, dispatch] = useReducer(activeTripReducer, {
    exchangeRates: null,
    tripLocations: [],
    tripLocationTree: [],
    tripPlaces: [],
    sourceEmailMap: {},
    refreshKey: 0,
    myRole: null,
  });

  const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);

  const setActiveTrip = useCallback((id: string) => {
    dispatch({ type: 'RESET_TRIP_DATA' });
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
      await updateTrip(activeTrip.id, updates);
      updateTripInList({ id: activeTrip.id, ...updates });
      toast({ title: 'Trip updated' });
    } catch (error) {
      console.error('Failed to update trip:', error);
      toast({ title: 'Error', description: 'Failed to update trip.', variant: 'destructive' });
    }
  }, [activeTrip, updateTripInList, toast]);

  const deleteCurrentTrip = useCallback(async () => {
    if (!activeTrip) return;
    try {
      await deleteTrip(activeTrip.id);
      removeTrip(activeTrip.id);
      dispatch({ type: 'RESET_TRIP_DATA' });
      toast({ title: 'Trip Deleted' });
    } catch (error) {
      console.error('Failed to delete trip:', error);
      toast({ title: 'Error', description: 'Failed to delete trip.', variant: 'destructive' });
    }
  }, [activeTrip, removeTrip, toast]);

  // Load trip locations from DB, enriched with Hebrew names from country JSON
  const loadLocations = useCallback(async (tripId: string) => {
    try {
      const flat = await fetchTripLocations(tripId);
      // Enrich with Hebrew names from country data
      const countries = activeTrip?.countries ?? [];
      const countryResults = countries.length > 0
        ? await Promise.all(countries.map(c => loadCountryData(c)))
        : [];
      const descMap = countryResults.length > 0 ? buildDescriptionMap(countryResults) : undefined;
      const tree = buildLocationTree(flat, descMap);
      dispatch({ type: 'SET_TRIP_LOCATIONS', payload: { flat, tree } });
    } catch (e) {
      console.error('Failed to load trip locations:', e);
    }
  }, [activeTrip?.countries]);

  const loadPlaces = useCallback(async (tripId: string) => {
    try {
      const places = await fetchTripPlaces(tripId);
      dispatch({ type: 'SET_TRIP_PLACES', payload: places });
    } catch (e) {
      console.error('Failed to load trip places:', e);
    }
  }, []);

  const reloadLocations = useCallback(async () => {
    if (activeTrip) await loadLocations(activeTrip.id);
  }, [activeTrip, loadLocations]);

  const reloadTripPlaces = useCallback(async () => {
    if (activeTrip) await loadPlaces(activeTrip.id);
  }, [activeTrip, loadPlaces]);

  const loadTripMetadata = useCallback(async (tripId: string) => {
    // Load locations and places
    await loadLocations(tripId);
    await loadPlaces(tripId);

    // Load email map (still from source_emails)
    try {
      const { data: emails } = await supabaseClient
        .from('source_emails')
        .select('id, source_email_info')
        .eq('trip_id', tripId)
        .eq('status', 'linked');

      const emailMap: Record<string, { permalink?: string; subject?: string }> = {};
      for (const email of (emails || [])) {
        const info = email.source_email_info as { email_permalink?: string; subject?: string } | undefined;
        emailMap[email.id] = { permalink: info?.email_permalink, subject: info?.subject };
      }
      dispatch({ type: 'SET_SOURCE_EMAIL_MAP', payload: emailMap });
    } catch (e) {
      console.error('Failed to load source email map:', e);
    }
  }, [loadLocations]);

  const loadTripData = useCallback(async (tripId: string) => {
    await loadTripMetadata(tripId);
    dispatch({ type: 'INCREMENT_REFRESH_KEY' });
  }, [loadTripMetadata]);

  const addSiteToHierarchy = useCallback((siteName: string, parentSiteName?: string) => {
    if (!activeTrip) return;

    // Find parent ID from the flat list
    let parentId: string | null = null;
    if (parentSiteName) {
      const parent = findInFlatList(state.tripLocations, parentSiteName);
      if (parent) parentId = parent.id;
    }

    // Insert into DB, then reload
    addTripLocation(activeTrip.id, siteName, 'city', parentId, 'manual')
      .then(() => loadLocations(activeTrip.id))
      .catch(e => console.error('Failed to add location:', e));
  }, [activeTrip, state.tripLocations, loadLocations]);

  const setExchangeRates = useCallback((rates: ExchangeRates | null) => {
    dispatch({ type: 'SET_EXCHANGE_RATES', payload: rates });
  }, []);

  // Fetch data when active trip changes
  const prevTripIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTrip && activeTrip.id !== prevTripIdRef.current) {
      prevTripIdRef.current = activeTrip.id;
      loadTripMetadata(activeTrip.id);
      dispatch({ type: 'SET_MY_ROLE', payload: activeTrip.myRole || 'owner' });
      fetchExchangeRates(activeTrip.currency, activeTrip.countries)
        .then(rates => dispatch({ type: 'SET_EXCHANGE_RATES', payload: rates }))
        .catch(e => console.error('Failed to fetch exchange rates:', e));
    } else if (!activeTrip) {
      prevTripIdRef.current = null;
    }
  }, [activeTrip, loadTripMetadata]);

  // Subscribe to realtime changes on trip_locations and trip_places
  useEffect(() => {
    if (!activeTrip) return;
    const channel = supabaseClient
      .channel(`trip_locations_places_${activeTrip.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_locations',
        filter: `trip_id=eq.${activeTrip.id}`,
      }, () => { loadLocations(activeTrip.id); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_places',
        filter: `trip_id=eq.${activeTrip.id}`,
      }, () => { loadPlaces(activeTrip.id); })
      .subscribe();

    return () => { supabaseClient.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, loadLocations, loadPlaces]);

  const value = useMemo(() => ({
    activeTrip,
    exchangeRates: state.exchangeRates,
    tripLocationTree: state.tripLocationTree,
    tripLocations: state.tripLocations,
    tripPlaces: state.tripPlaces,
    sourceEmailMap: state.sourceEmailMap,
    refreshKey: state.refreshKey,
    myRole: state.myRole,
    isLoading,
    error,
    setActiveTrip,
    updateCurrentTrip,
    deleteCurrentTrip,
    loadTripData,
    setExchangeRates,
    addSiteToHierarchy,
    reloadLocations,
    reloadTripPlaces,
  }), [activeTrip, state.exchangeRates, state.tripLocationTree, state.tripLocations, state.tripPlaces, state.sourceEmailMap, state.refreshKey, state.myRole, isLoading, error, setActiveTrip, updateCurrentTrip, deleteCurrentTrip, loadTripData, setExchangeRates, addSiteToHierarchy, reloadLocations, reloadTripPlaces]);

  return <ActiveTripContext.Provider value={value}>{children}</ActiveTripContext.Provider>;
}

export function useActiveTrip() {
  const context = useContext(ActiveTripContext);
  if (!context) throw new Error('useActiveTrip must be used within an ActiveTripProvider');
  return context;
}
