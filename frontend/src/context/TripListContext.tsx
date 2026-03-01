import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Trip } from '@/types/trip';
import { fetchTrips, createTrip } from '@/services/tripService';
import { useToast } from '@/hooks/use-toast';

// State
interface TripListState {
  trips: Trip[];
  activeTripId: string | null;
  isLoading: boolean;
  error: string | null;
}

// Actions
type TripListAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LOAD_TRIPS'; payload: Trip[] }
  | { type: 'SET_ACTIVE_TRIP_ID'; payload: string | null }
  | { type: 'ADD_TRIP'; payload: Trip }
  | { type: 'REMOVE_TRIP'; payload: string }
  | { type: 'UPDATE_TRIP'; payload: Partial<Trip> & { id: string } };

function tripListReducer(state: TripListState, action: TripListAction): TripListState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'LOAD_TRIPS': {
      const firstId = action.payload.length > 0 ? action.payload[0].id : null;
      return { ...state, trips: action.payload, activeTripId: firstId, isLoading: false };
    }
    case 'SET_ACTIVE_TRIP_ID':
      return { ...state, activeTripId: action.payload };
    case 'ADD_TRIP':
      return { ...state, trips: [action.payload, ...state.trips], activeTripId: action.payload.id };
    case 'REMOVE_TRIP': {
      const filtered = state.trips.filter(t => t.id !== action.payload);
      const newActiveId = state.activeTripId === action.payload
        ? (filtered.length > 0 ? filtered[0].id : null)
        : state.activeTripId;
      return { ...state, trips: filtered, activeTripId: newActiveId };
    }
    case 'UPDATE_TRIP': {
      const { id, ...updates } = action.payload;
      return { ...state, trips: state.trips.map(t => t.id === id ? { ...t, ...updates } : t) };
    }
    default:
      return state;
  }
}

// Context type
interface TripListContextType {
  trips: Trip[];
  activeTripId: string | null;
  isLoading: boolean;
  error: string | null;
  loadTrips: () => Promise<void>;
  setActiveTripId: (id: string) => void;
  createNewTrip: (name: string, description: string, startDate: string, endDate: string, countries?: string[]) => Promise<void>;
  removeTrip: (id: string) => void;
  updateTripInList: (updates: Partial<Trip> & { id: string }) => void;
}

const TripListContext = createContext<TripListContextType | undefined>(undefined);

export function TripListProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [state, dispatch] = useReducer(tripListReducer, {
    trips: [],
    activeTripId: null,
    isLoading: true,
    error: null,
  });

  const loadTrips = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const trips = await fetchTrips();
      dispatch({ type: 'LOAD_TRIPS', payload: trips });
    } catch (error) {
      console.error('Failed to load trips:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load trips' });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const setActiveTripId = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_TRIP_ID', payload: id });
  }, []);

  const createNewTrip = useCallback(async (name: string, description: string, startDate: string, endDate: string, countries: string[] = []) => {
    try {
      const newTrip = await createTrip({
        name, description, startDate, endDate, currency: 'ILS', countries, status: 'research',
      });
      dispatch({ type: 'ADD_TRIP', payload: newTrip });
      toast({ title: 'Trip Created', description: `"${name}" has been created.` });
    } catch (error) {
      console.error('Failed to create trip:', error);
      toast({ title: 'Error', description: 'Failed to create trip.', variant: 'destructive' });
    }
  }, [toast]);

  const removeTrip = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TRIP', payload: id });
  }, []);

  const updateTripInList = useCallback((updates: Partial<Trip> & { id: string }) => {
    dispatch({ type: 'UPDATE_TRIP', payload: updates });
  }, []);

  // Load trips on mount
  useEffect(() => { loadTrips(); }, [loadTrips]);

  const value = useMemo(() => ({
    trips: state.trips,
    activeTripId: state.activeTripId,
    isLoading: state.isLoading,
    error: state.error,
    loadTrips,
    setActiveTripId,
    createNewTrip,
    removeTrip,
    updateTripInList,
  }), [state.trips, state.activeTripId, state.isLoading, state.error, loadTrips, setActiveTripId, createNewTrip, removeTrip, updateTripInList]);

  return <TripListContext.Provider value={value}>{children}</TripListContext.Provider>;
}

export function useTripList() {
  const context = useContext(TripListContext);
  if (!context) throw new Error('useTripList must be used within a TripListProvider');
  return context;
}
