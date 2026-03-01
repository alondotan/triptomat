import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Transportation } from '@/types/trip';
import { fetchTransportation, createTransportation as createTransportationService, updateTransportation as updateTransportationService, deleteTransportation as deleteTransportationService, mergeTwoTransportations } from '@/services/transportService';
import { repairItineraryReferences } from '@/services/tripService';
import { useToast } from '@/hooks/use-toast';
import { useActiveTrip } from './ActiveTripContext';

// State
interface TransportState {
  transportation: Transportation[];
}

type TransportAction =
  | { type: 'SET_TRANSPORTATION'; payload: Transportation[] }
  | { type: 'ADD_TRANSPORTATION'; payload: Transportation }
  | { type: 'UPDATE_TRANSPORTATION'; payload: Transportation }
  | { type: 'DELETE_TRANSPORTATION'; payload: string };

function transportReducer(state: TransportState, action: TransportAction): TransportState {
  switch (action.type) {
    case 'SET_TRANSPORTATION':
      return { transportation: action.payload };
    case 'ADD_TRANSPORTATION':
      return { transportation: [...state.transportation, action.payload] };
    case 'UPDATE_TRANSPORTATION':
      return { transportation: state.transportation.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TRANSPORTATION':
      return { transportation: state.transportation.filter(t => t.id !== action.payload) };
    default:
      return state;
  }
}

// Context type
interface TransportContextType {
  transportation: Transportation[];
  addTransportation: (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Transportation | undefined>;
  updateTransportation: (t: Transportation) => Promise<void>;
  deleteTransportation: (id: string) => Promise<void>;
  mergeTransportation: (primaryId: string, secondaryId: string) => Promise<void>;
}

const TransportContext = createContext<TransportContextType | undefined>(undefined);

export function TransportProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { activeTrip, refreshKey } = useActiveTrip();
  const [state, dispatch] = useReducer(transportReducer, { transportation: [] });

  // Load transportation when active trip changes
  useEffect(() => {
    if (activeTrip) {
      fetchTransportation(activeTrip.id).then(t => dispatch({ type: 'SET_TRANSPORTATION', payload: t }));
    } else {
      dispatch({ type: 'SET_TRANSPORTATION', payload: [] });
    }
  }, [activeTrip?.id, refreshKey]);

  // Realtime subscription
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;

    let channel: ReturnType<typeof import('@/integrations/supabase/client')['supabase']['channel']> | null = null;

    import('@/integrations/supabase/client').then(({ supabase }) => {
      channel = supabase
        .channel(`transport-realtime-${tripId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transportation', filter: `trip_id=eq.${tripId}` }, () => {
          fetchTransportation(tripId).then(t => dispatch({ type: 'SET_TRANSPORTATION', payload: t }));
        })
        .subscribe();
    });

    return () => {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [activeTrip?.id]);

  const addTransportation = useCallback(async (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transportation | undefined> => {
    try {
      const newT = await createTransportationService(t);
      dispatch({ type: 'ADD_TRANSPORTATION', payload: newT });
      return newT;
    } catch (error) {
      console.error('Failed to add transportation:', error);
      toast({ title: 'Error', description: 'Failed to add transportation.', variant: 'destructive' });
      return undefined;
    }
  }, [toast]);

  const updateTransportation = useCallback(async (t: Transportation) => {
    try {
      await updateTransportationService(t.id, t);
      dispatch({ type: 'UPDATE_TRANSPORTATION', payload: t });
    } catch (error) {
      console.error('Failed to update transportation:', error);
      toast({ title: 'Error', description: 'Failed to update transportation.', variant: 'destructive' });
    }
  }, [toast]);

  const deleteTransportation = useCallback(async (id: string) => {
    try {
      await deleteTransportationService(id);
      dispatch({ type: 'DELETE_TRANSPORTATION', payload: id });
    } catch (error) {
      console.error('Failed to delete transportation:', error);
      toast({ title: 'Error', description: 'Failed to delete transportation.', variant: 'destructive' });
    }
  }, [toast]);

  const mergeTransportation = useCallback(async (primaryId: string, secondaryId: string) => {
    const primary = state.transportation.find(t => t.id === primaryId);
    const secondary = state.transportation.find(t => t.id === secondaryId);
    if (!primary || !secondary || !activeTrip) return;
    try {
      const merged = await mergeTwoTransportations(primary, secondary);
      await repairItineraryReferences(activeTrip.id, secondaryId, primaryId, 'transportation');
      dispatch({ type: 'UPDATE_TRANSPORTATION', payload: merged });
      dispatch({ type: 'DELETE_TRANSPORTATION', payload: secondaryId });
      // Itinerary realtime subscription will auto-sync
      toast({ title: 'מוזג בהצלחה', description: 'פריטי התחבורה מוזגו.' });
    } catch (error) {
      console.error('Failed to merge transportation:', error);
      toast({ title: 'שגיאה', description: 'המיזוג נכשל.', variant: 'destructive' });
    }
  }, [state.transportation, activeTrip, toast]);

  const value = useMemo(() => ({
    transportation: state.transportation,
    addTransportation,
    updateTransportation,
    deleteTransportation,
    mergeTransportation,
  }), [state.transportation, addTransportation, updateTransportation, deleteTransportation, mergeTransportation]);

  return <TransportContext.Provider value={value}>{children}</TransportContext.Provider>;
}

export function useTransport() {
  const context = useContext(TransportContext);
  if (!context) throw new Error('useTransport must be used within a TransportProvider');
  return context;
}
