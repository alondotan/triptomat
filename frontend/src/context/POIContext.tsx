import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { PointOfInterest } from '@/types/trip';
import { fetchPOIs, createOrMergePOI, updatePOI as updatePOIService, deletePOI as deletePOIService, mergeTwoPOIs } from '@/services/poiService';
import { repairItineraryReferences } from '@/services/tripService';
import { useToast } from '@/hooks/use-toast';
import { useActiveTrip } from './ActiveTripContext';

// State
interface POIState {
  pois: PointOfInterest[];
}

type POIAction =
  | { type: 'SET_POIS'; payload: PointOfInterest[] }
  | { type: 'ADD_POI'; payload: PointOfInterest }
  | { type: 'UPDATE_POI'; payload: PointOfInterest }
  | { type: 'DELETE_POI'; payload: string };

function poiReducer(state: POIState, action: POIAction): POIState {
  switch (action.type) {
    case 'SET_POIS':
      return { pois: action.payload };
    case 'ADD_POI':
      return { pois: [...state.pois, action.payload] };
    case 'UPDATE_POI':
      return { pois: state.pois.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_POI':
      return { pois: state.pois.filter(p => p.id !== action.payload) };
    default:
      return state;
  }
}

// Context type
interface POIContextType {
  pois: PointOfInterest[];
  addPOI: (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PointOfInterest | undefined>;
  updatePOI: (poi: PointOfInterest) => Promise<void>;
  deletePOI: (poiId: string) => Promise<void>;
  mergePOIs: (primaryId: string, secondaryId: string) => Promise<void>;
}

const POIContext = createContext<POIContextType | undefined>(undefined);

export function POIProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { activeTrip, refreshKey } = useActiveTrip();
  const [state, dispatch] = useReducer(poiReducer, { pois: [] });

  // Load POIs when active trip changes
  useEffect(() => {
    if (activeTrip) {
      fetchPOIs(activeTrip.id).then(pois => dispatch({ type: 'SET_POIS', payload: pois }));
    } else {
      dispatch({ type: 'SET_POIS', payload: [] });
    }
  }, [activeTrip?.id, refreshKey]);

  // Realtime subscription
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;

    let channel: ReturnType<typeof import('@/integrations/supabase/client')['supabase']['channel']> | null = null;

    import('@/integrations/supabase/client').then(({ supabase }) => {
      channel = supabase
        .channel(`poi-realtime-${tripId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'points_of_interest', filter: `trip_id=eq.${tripId}` }, () => {
          fetchPOIs(tripId).then(pois => dispatch({ type: 'SET_POIS', payload: pois }));
        })
        .subscribe();
    });

    return () => {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [activeTrip?.id]);

  const addPOI = useCallback(async (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>): Promise<PointOfInterest | undefined> => {
    try {
      const { poi: result, merged } = await createOrMergePOI(poi);
      if (merged) {
        dispatch({ type: 'UPDATE_POI', payload: result });
        toast({ title: 'מוזג עם מקום קיים', description: `"${result.name}" כבר קיים — המידע שהוספת שולב עמו.` });
      } else {
        dispatch({ type: 'ADD_POI', payload: result });
      }
      return result;
    } catch (error) {
      console.error('Failed to add POI:', error);
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
      return undefined;
    }
  }, [toast]);

  const updatePOI = useCallback(async (poi: PointOfInterest) => {
    try {
      await updatePOIService(poi.id, poi);
      dispatch({ type: 'UPDATE_POI', payload: poi });
    } catch (error) {
      console.error('Failed to update POI:', error);
      toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
    }
  }, [toast]);

  const deletePOI = useCallback(async (poiId: string) => {
    try {
      await deletePOIService(poiId);
      dispatch({ type: 'DELETE_POI', payload: poiId });
    } catch (error) {
      console.error('Failed to delete POI:', error);
      toast({ title: 'Error', description: 'Failed to delete item.', variant: 'destructive' });
    }
  }, [toast]);

  const mergePOIs = useCallback(async (primaryId: string, secondaryId: string) => {
    const primary = state.pois.find(p => p.id === primaryId);
    const secondary = state.pois.find(p => p.id === secondaryId);
    if (!primary || !secondary || !activeTrip) return;
    try {
      const merged = await mergeTwoPOIs(primary, secondary);
      await repairItineraryReferences(activeTrip.id, secondaryId, primaryId, 'poi');
      dispatch({ type: 'UPDATE_POI', payload: merged });
      dispatch({ type: 'DELETE_POI', payload: secondaryId });
      // Itinerary realtime subscription will auto-sync
      toast({ title: 'מוזג בהצלחה', description: `"${secondary.name}" מוזג לתוך "${primary.name}"` });
    } catch (error) {
      console.error('Failed to merge POIs:', error);
      toast({ title: 'שגיאה', description: 'המיזוג נכשל.', variant: 'destructive' });
    }
  }, [state.pois, activeTrip, toast]);

  const value = useMemo(() => ({
    pois: state.pois,
    addPOI,
    updatePOI,
    deletePOI,
    mergePOIs,
  }), [state.pois, addPOI, updatePOI, deletePOI, mergePOIs]);

  return <POIContext.Provider value={value}>{children}</POIContext.Provider>;
}

export function usePOI() {
  const context = useContext(POIContext);
  if (!context) throw new Error('usePOI must be used within a POIProvider');
  return context;
}
