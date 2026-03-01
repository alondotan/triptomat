import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Trip } from '@/types/trip';
import { SiteHierarchyNode } from '@/types/webhook';
import * as tripService from '@/services/tripService';
import { ExchangeRates, fetchExchangeRates } from '@/services/exchangeRateService';
import { useToast } from '@/hooks/use-toast';
import { useTripList } from './TripListContext';

// State
interface ActiveTripState {
  exchangeRates: ExchangeRates | null;
  tripSitesHierarchy: SiteHierarchyNode[];
  sourceEmailMap: Record<string, { permalink?: string; subject?: string }>;
  refreshKey: number;
}

type ActiveTripAction =
  | { type: 'SET_EXCHANGE_RATES'; payload: ExchangeRates | null }
  | { type: 'SET_TRIP_SITES_HIERARCHY'; payload: SiteHierarchyNode[] }
  | { type: 'SET_SOURCE_EMAIL_MAP'; payload: Record<string, { permalink?: string; subject?: string }> }
  | { type: 'INCREMENT_REFRESH_KEY' }
  | { type: 'RESET_TRIP_DATA' };

function activeTripReducer(state: ActiveTripState, action: ActiveTripAction): ActiveTripState {
  switch (action.type) {
    case 'SET_EXCHANGE_RATES':
      return { ...state, exchangeRates: action.payload };
    case 'SET_TRIP_SITES_HIERARCHY':
      return { ...state, tripSitesHierarchy: action.payload };
    case 'SET_SOURCE_EMAIL_MAP':
      return { ...state, sourceEmailMap: action.payload };
    case 'INCREMENT_REFRESH_KEY':
      return { ...state, refreshKey: state.refreshKey + 1 };
    case 'RESET_TRIP_DATA':
      return { ...state, exchangeRates: null, tripSitesHierarchy: [], sourceEmailMap: {}, refreshKey: state.refreshKey + 1 };
    default:
      return state;
  }
}

// Context type
interface ActiveTripContextType {
  activeTrip: Trip | null;
  exchangeRates: ExchangeRates | null;
  tripSitesHierarchy: SiteHierarchyNode[];
  sourceEmailMap: Record<string, { permalink?: string; subject?: string }>;
  refreshKey: number;
  isLoading: boolean;
  error: string | null;
  setActiveTrip: (id: string) => void;
  updateCurrentTrip: (updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteCurrentTrip: () => Promise<void>;
  loadTripData: (tripId: string) => Promise<void>;
  setExchangeRates: (rates: ExchangeRates | null) => void;
}

const ActiveTripContext = createContext<ActiveTripContextType | undefined>(undefined);

export function ActiveTripProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { trips, activeTripId, isLoading, error, setActiveTripId, removeTrip, updateTripInList } = useTripList();

  const [state, dispatch] = useReducer(activeTripReducer, {
    exchangeRates: null,
    tripSitesHierarchy: [],
    sourceEmailMap: {},
    refreshKey: 0,
  });

  const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);

  const setActiveTrip = useCallback((id: string) => {
    dispatch({ type: 'RESET_TRIP_DATA' });
    setActiveTripId(id);
  }, [setActiveTripId]);

  const updateCurrentTrip = useCallback(async (updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>>) => {
    if (!activeTrip) return;
    try {
      await tripService.updateTrip(activeTrip.id, updates);
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
      await tripService.deleteTrip(activeTrip.id);
      removeTrip(activeTrip.id);
      dispatch({ type: 'RESET_TRIP_DATA' });
      toast({ title: 'Trip Deleted' });
    } catch (error) {
      console.error('Failed to delete trip:', error);
      toast({ title: 'Error', description: 'Failed to delete trip.', variant: 'destructive' });
    }
  }, [activeTrip, removeTrip, toast]);

  const loadTripMetadata = useCallback(async (tripId: string) => {
    // Load sites_hierarchy from source_emails AND source_recommendations
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const [{ data: emails }, { data: recommendations }] = await Promise.all([
        supabase
          .from('source_emails')
          .select('id, source_email_info, parsed_data')
          .eq('trip_id', tripId)
          .eq('status', 'linked'),
        supabase
          .from('source_recommendations')
          .select('analysis')
          .eq('trip_id', tripId)
          .eq('status', 'linked'),
      ]);
      const allHierarchy: SiteHierarchyNode[] = [];
      for (const email of (emails || [])) {
        const pd = email.parsed_data as any;
        if (pd?.sites_hierarchy && Array.isArray(pd.sites_hierarchy)) {
          allHierarchy.push(...pd.sites_hierarchy);
        }
      }
      for (const rec of (recommendations || [])) {
        const analysis = rec.analysis as any;
        if (analysis?.sites_hierarchy && Array.isArray(analysis.sites_hierarchy)) {
          allHierarchy.push(...analysis.sites_hierarchy);
        }
      }
      dispatch({ type: 'SET_TRIP_SITES_HIERARCHY', payload: allHierarchy });

      // Build email map
      const emailMap: Record<string, { permalink?: string; subject?: string }> = {};
      for (const email of (emails || [])) {
        const info = email.source_email_info as { email_permalink?: string; subject?: string } | undefined;
        emailMap[email.id] = { permalink: info?.email_permalink, subject: info?.subject };
      }
      dispatch({ type: 'SET_SOURCE_EMAIL_MAP', payload: emailMap });
    } catch (e) {
      console.error('Failed to load trip sites hierarchy:', e);
    }
  }, []);

  const loadTripData = useCallback(async (tripId: string) => {
    await loadTripMetadata(tripId);
    dispatch({ type: 'INCREMENT_REFRESH_KEY' });
  }, [loadTripMetadata]);

  const setExchangeRates = useCallback((rates: ExchangeRates | null) => {
    dispatch({ type: 'SET_EXCHANGE_RATES', payload: rates });
  }, []);

  // Fetch exchange rates when active trip changes
  const prevTripIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTrip && activeTrip.id !== prevTripIdRef.current) {
      prevTripIdRef.current = activeTrip.id;
      loadTripMetadata(activeTrip.id);
      fetchExchangeRates(activeTrip.currency, activeTrip.countries)
        .then(rates => dispatch({ type: 'SET_EXCHANGE_RATES', payload: rates }))
        .catch(e => console.error('Failed to fetch exchange rates:', e));
    } else if (!activeTrip) {
      prevTripIdRef.current = null;
    }
  }, [activeTrip, loadTripMetadata]);

  const value = useMemo(() => ({
    activeTrip,
    exchangeRates: state.exchangeRates,
    tripSitesHierarchy: state.tripSitesHierarchy,
    sourceEmailMap: state.sourceEmailMap,
    refreshKey: state.refreshKey,
    isLoading,
    error,
    setActiveTrip,
    updateCurrentTrip,
    deleteCurrentTrip,
    loadTripData,
    setExchangeRates,
  }), [activeTrip, state.exchangeRates, state.tripSitesHierarchy, state.sourceEmailMap, state.refreshKey, isLoading, error, setActiveTrip, updateCurrentTrip, deleteCurrentTrip, loadTripData, setExchangeRates]);

  return <ActiveTripContext.Provider value={value}>{children}</ActiveTripContext.Provider>;
}

export function useActiveTrip() {
  const context = useContext(ActiveTripContext);
  if (!context) throw new Error('useActiveTrip must be used within an ActiveTripProvider');
  return context;
}
