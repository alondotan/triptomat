import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { ItineraryDay, Mission } from '@/types/trip';
import { fetchItineraryDays } from '@/services/itineraryService';
import { fetchMissions, createMission as createMissionService, updateMission as updateMissionService, deleteMission as deleteMissionService } from '@/services/missionService';
import { useToast } from '@/hooks/use-toast';
import { useActiveTrip } from './ActiveTripContext';

// State
interface ItineraryState {
  itineraryDays: ItineraryDay[];
  missions: Mission[];
}

type ItineraryAction =
  | { type: 'SET_ITINERARY_DAYS'; payload: ItineraryDay[] }
  | { type: 'SET_MISSIONS'; payload: Mission[] }
  | { type: 'ADD_MISSION'; payload: Mission }
  | { type: 'UPDATE_MISSION'; payload: { id: string; updates: Partial<Mission> } }
  | { type: 'DELETE_MISSION'; payload: string };

function itineraryReducer(state: ItineraryState, action: ItineraryAction): ItineraryState {
  switch (action.type) {
    case 'SET_ITINERARY_DAYS':
      return { ...state, itineraryDays: action.payload };
    case 'SET_MISSIONS':
      return { ...state, missions: action.payload };
    case 'ADD_MISSION':
      return { ...state, missions: [...state.missions, action.payload] };
    case 'UPDATE_MISSION':
      return { ...state, missions: state.missions.map(m => m.id === action.payload.id ? { ...m, ...action.payload.updates } : m) };
    case 'DELETE_MISSION':
      return { ...state, missions: state.missions.filter(m => m.id !== action.payload) };
    default:
      return state;
  }
}

// Context type
interface ItineraryContextType {
  itineraryDays: ItineraryDay[];
  setItineraryDays: (days: ItineraryDay[]) => void;
  missions: Mission[];
  addMission: (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateMission: (id: string, updates: Partial<Mission>) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;
  refetchItinerary: () => Promise<void>;
}

const ItineraryContext = createContext<ItineraryContextType | undefined>(undefined);

export function ItineraryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { activeTrip, refreshKey } = useActiveTrip();
  const [state, dispatch] = useReducer(itineraryReducer, { itineraryDays: [], missions: [] });

  // Load itinerary days and missions when active trip changes
  useEffect(() => {
    if (activeTrip) {
      Promise.all([
        fetchItineraryDays(activeTrip.id),
        fetchMissions(activeTrip.id),
      ]).then(([days, missions]) => {
        dispatch({ type: 'SET_ITINERARY_DAYS', payload: days });
        dispatch({ type: 'SET_MISSIONS', payload: missions });
      });
    } else {
      dispatch({ type: 'SET_ITINERARY_DAYS', payload: [] });
      dispatch({ type: 'SET_MISSIONS', payload: [] });
    }
  }, [activeTrip?.id, refreshKey]);

  // Realtime subscription for itinerary_days
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;

    let channel: ReturnType<typeof import('@/integrations/supabase/client')['supabase']['channel']> | null = null;

    import('@/integrations/supabase/client').then(({ supabase }) => {
      channel = supabase
        .channel(`itinerary-realtime-${tripId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_days', filter: `trip_id=eq.${tripId}` }, () => {
          fetchItineraryDays(tripId).then(days => dispatch({ type: 'SET_ITINERARY_DAYS', payload: days }));
        })
        .subscribe();
    });

    return () => {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [activeTrip?.id]);

  const addMission = useCallback(async (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newM = await createMissionService(m);
      dispatch({ type: 'ADD_MISSION', payload: newM });
    } catch (error) {
      console.error('Failed to add mission:', error);
      toast({ title: 'Error', description: 'Failed to add mission.', variant: 'destructive' });
    }
  }, [toast]);

  const updateMission = useCallback(async (id: string, updates: Partial<Mission>) => {
    try {
      await updateMissionService(id, updates);
      dispatch({ type: 'UPDATE_MISSION', payload: { id, updates } });
    } catch (error) {
      console.error('Failed to update mission:', error);
      toast({ title: 'Error', description: 'Failed to update mission.', variant: 'destructive' });
    }
  }, [toast]);

  const deleteMission = useCallback(async (id: string) => {
    try {
      await deleteMissionService(id);
      dispatch({ type: 'DELETE_MISSION', payload: id });
    } catch (error) {
      console.error('Failed to delete mission:', error);
      toast({ title: 'Error', description: 'Failed to delete mission.', variant: 'destructive' });
    }
  }, [toast]);

  const refetchItinerary = useCallback(async () => {
    if (!activeTrip) return;
    const days = await fetchItineraryDays(activeTrip.id);
    dispatch({ type: 'SET_ITINERARY_DAYS', payload: days });
  }, [activeTrip]);

  const setItineraryDays = useCallback((days: ItineraryDay[]) => {
    dispatch({ type: 'SET_ITINERARY_DAYS', payload: days });
  }, []);

  const value = useMemo(() => ({
    itineraryDays: state.itineraryDays,
    setItineraryDays,
    missions: state.missions,
    addMission,
    updateMission,
    deleteMission,
    refetchItinerary,
  }), [state.itineraryDays, setItineraryDays, state.missions, addMission, updateMission, deleteMission, refetchItinerary]);

  return <ItineraryContext.Provider value={value}>{children}</ItineraryContext.Provider>;
}

export function useItinerary() {
  const context = useContext(ItineraryContext);
  if (!context) throw new Error('useItinerary must be used within an ItineraryProvider');
  return context;
}
