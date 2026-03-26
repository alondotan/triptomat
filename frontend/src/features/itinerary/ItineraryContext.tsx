import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { ItineraryDay, ItineraryLocation, Mission, Contact } from '@/types/trip';
import { fetchItineraryDays } from '@/features/itinerary/itineraryService';
import { fetchItineraryLocations } from '@/features/itinerary/itineraryLocationService';
import { fetchMissions, createMission as createMissionService, updateMission as updateMissionService, deleteMission as deleteMissionService } from '@/features/missions/missionService';
import { fetchContacts, createContact as createContactService, updateContact as updateContactService, deleteContact as deleteContactService } from '@/features/contacts/contactService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';

// State
interface ItineraryState {
  itineraryDays: ItineraryDay[];
  itineraryLocations: ItineraryLocation[];
  missions: Mission[];
  contacts: Contact[];
}

type ItineraryAction =
  | { type: 'SET_ITINERARY_DAYS'; payload: ItineraryDay[] }
  | { type: 'SET_ITINERARY_LOCATIONS'; payload: ItineraryLocation[] }
  | { type: 'SET_MISSIONS'; payload: Mission[] }
  | { type: 'ADD_MISSION'; payload: Mission }
  | { type: 'UPDATE_MISSION'; payload: { id: string; updates: Partial<Mission> } }
  | { type: 'DELETE_MISSION'; payload: string }
  | { type: 'SET_CONTACTS'; payload: Contact[] }
  | { type: 'ADD_CONTACT'; payload: Contact }
  | { type: 'UPDATE_CONTACT'; payload: Contact }
  | { type: 'DELETE_CONTACT'; payload: string };

function itineraryReducer(state: ItineraryState, action: ItineraryAction): ItineraryState {
  switch (action.type) {
    case 'SET_ITINERARY_DAYS':
      return { ...state, itineraryDays: action.payload };
    case 'SET_ITINERARY_LOCATIONS':
      return { ...state, itineraryLocations: action.payload };
    case 'SET_MISSIONS':
      return { ...state, missions: action.payload };
    case 'ADD_MISSION':
      return { ...state, missions: [...state.missions, action.payload] };
    case 'UPDATE_MISSION':
      return { ...state, missions: state.missions.map(m => m.id === action.payload.id ? { ...m, ...action.payload.updates } : m) };
    case 'DELETE_MISSION':
      return { ...state, missions: state.missions.filter(m => m.id !== action.payload) };
    case 'SET_CONTACTS':
      return { ...state, contacts: action.payload };
    case 'ADD_CONTACT':
      return { ...state, contacts: [action.payload, ...state.contacts] };
    case 'UPDATE_CONTACT':
      return { ...state, contacts: state.contacts.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CONTACT':
      return { ...state, contacts: state.contacts.filter(c => c.id !== action.payload) };
    default:
      return state;
  }
}

// Context type
interface ItineraryContextType {
  itineraryDays: ItineraryDay[];
  setItineraryDays: (days: ItineraryDay[]) => void;
  itineraryLocations: ItineraryLocation[];
  refetchItineraryLocations: () => Promise<void>;
  missions: Mission[];
  addMission: (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateMission: (id: string, updates: Partial<Mission>) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;
  refetchItinerary: () => Promise<void>;
  // Contacts (merged from ContactsContext)
  contacts: Contact[];
  addContact: (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
}

export const ItineraryContext = createContext<ItineraryContextType | undefined>(undefined);

export function ItineraryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { activeTrip, refreshKey } = useActiveTrip();
  const [state, dispatch] = useReducer(itineraryReducer, { itineraryDays: [], itineraryLocations: [], missions: [], contacts: [] });

  // Load all data when active trip changes
  useEffect(() => {
    dispatch({ type: 'SET_ITINERARY_DAYS', payload: [] });
    dispatch({ type: 'SET_ITINERARY_LOCATIONS', payload: [] });
    dispatch({ type: 'SET_MISSIONS', payload: [] });
    dispatch({ type: 'SET_CONTACTS', payload: [] });
    if (activeTrip) {
      Promise.all([
        fetchItineraryDays(activeTrip.id),
        fetchItineraryLocations(activeTrip.id),
        fetchMissions(activeTrip.id),
        fetchContacts(activeTrip.id),
      ]).then(([days, locations, missions, contacts]) => {
        dispatch({ type: 'SET_ITINERARY_DAYS', payload: days });
        dispatch({ type: 'SET_ITINERARY_LOCATIONS', payload: locations });
        dispatch({ type: 'SET_MISSIONS', payload: missions });
        dispatch({ type: 'SET_CONTACTS', payload: contacts });
      });
    }
  }, [activeTrip?.id, refreshKey]);

  // Realtime subscription for itinerary_days
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;

    const channel = supabase
      .channel(`itinerary-realtime-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_days', filter: `trip_id=eq.${tripId}` }, () => {
        fetchItineraryDays(tripId).then(days => dispatch({ type: 'SET_ITINERARY_DAYS', payload: days }));
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Itinerary realtime subscription error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTrip?.id]);

  // Realtime subscription for missions
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;

    const channel = supabase
      .channel(`missions-realtime-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions', filter: `trip_id=eq.${tripId}` }, () => {
        fetchMissions(tripId).then(missions => dispatch({ type: 'SET_MISSIONS', payload: missions }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTrip?.id]);

  // Realtime subscription for itinerary_locations
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;

    const channel = supabase
      .channel(`itinerary-locations-realtime-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_locations', filter: `trip_id=eq.${tripId}` }, () => {
        fetchItineraryLocations(tripId).then(locs => dispatch({ type: 'SET_ITINERARY_LOCATIONS', payload: locs }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTrip?.id]);

  // Mission operations
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

  // Contact operations
  const addContact = useCallback(async (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newC = await createContactService(c);
      dispatch({ type: 'ADD_CONTACT', payload: newC });
    } catch (error) {
      console.error('Failed to add contact:', error);
      toast({ title: 'Error', description: 'Failed to add contact.', variant: 'destructive' });
    }
  }, [toast]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    try {
      await updateContactService(id, updates);
      const existing = state.contacts.find(c => c.id === id);
      if (existing) dispatch({ type: 'UPDATE_CONTACT', payload: { ...existing, ...updates } });
    } catch (error) {
      console.error('Failed to update contact:', error);
      toast({ title: 'Error', description: 'Failed to update contact.', variant: 'destructive' });
    }
  }, [state.contacts, toast]);

  const deleteContact = useCallback(async (id: string) => {
    try {
      await deleteContactService(id);
      dispatch({ type: 'DELETE_CONTACT', payload: id });
    } catch (error) {
      console.error('Failed to delete contact:', error);
      toast({ title: 'Error', description: 'Failed to delete contact.', variant: 'destructive' });
    }
  }, [toast]);

  const refetchItinerary = useCallback(async () => {
    if (!activeTrip) return;
    const days = await fetchItineraryDays(activeTrip.id);
    dispatch({ type: 'SET_ITINERARY_DAYS', payload: days });
  }, [activeTrip]);

  const refetchItineraryLocations = useCallback(async () => {
    if (!activeTrip) return;
    const locs = await fetchItineraryLocations(activeTrip.id);
    dispatch({ type: 'SET_ITINERARY_LOCATIONS', payload: locs });
  }, [activeTrip]);

  const setItineraryDays = useCallback((days: ItineraryDay[]) => {
    dispatch({ type: 'SET_ITINERARY_DAYS', payload: days });
  }, []);

  const value = useMemo(() => ({
    itineraryDays: state.itineraryDays,
    setItineraryDays,
    itineraryLocations: state.itineraryLocations,
    refetchItineraryLocations,
    missions: state.missions,
    addMission,
    updateMission,
    deleteMission,
    refetchItinerary,
    contacts: state.contacts,
    addContact,
    updateContact,
    deleteContact,
  }), [state.itineraryDays, setItineraryDays, state.itineraryLocations, refetchItineraryLocations, state.missions, addMission, updateMission, deleteMission, refetchItinerary, state.contacts, addContact, updateContact, deleteContact]);

  return <ItineraryContext.Provider value={value}>{children}</ItineraryContext.Provider>;
}

export function useItinerary() {
  const context = useContext(ItineraryContext);
  if (!context) throw new Error('useItinerary must be used within an ItineraryProvider');
  return context;
}

/** Backward-compatible hook — contacts are now part of ItineraryContext. */
export function useContacts() {
  const { contacts, addContact, updateContact, deleteContact } = useItinerary();
  return { contacts, addContact, updateContact, deleteContact };
}
