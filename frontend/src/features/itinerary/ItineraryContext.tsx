import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { ItineraryDay, Mission, Contact } from '@/types/trip';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import {
  useItineraryDays,
  useSetItineraryDays,
  useRefetchItinerary,
} from './useItineraryQueries';
import { useMissions, useAddMission, useUpdateMission, useDeleteMission } from '@/features/missions/useMissionQueries';
import { useContactsQuery, useAddContact, useUpdateContact, useDeleteContact } from '@/features/contacts/useContactQueries';

/**
 * Thin wrapper combining itinerary days, missions, and contacts. Each domain
 * is now backed by TanStack Query hooks. The legacy `useItinerary()` and
 * `useContacts()` APIs are preserved for backwards compatibility.
 */

interface ItineraryContextType {
  itineraryDays: ItineraryDay[];
  setItineraryDays: (days: ItineraryDay[]) => void;
  missions: Mission[];
  addMission: (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateMission: (id: string, updates: Partial<Mission>) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;
  refetchItinerary: () => Promise<void>;
  contacts: Contact[];
  addContact: (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
}

export const ItineraryContext = createContext<ItineraryContextType | undefined>(undefined);

export function ItineraryProvider({ children }: { children: ReactNode }) {
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const { data: itineraryDays = [] } = useItineraryDays(tripId);
  const setItineraryDaysCache = useSetItineraryDays(tripId);
  const refetchItineraryFn = useRefetchItinerary(tripId);

  const { data: missions = [] } = useMissions(tripId);
  const addMissionMut = useAddMission(tripId);
  const updateMissionMut = useUpdateMission(tripId);
  const deleteMissionMut = useDeleteMission(tripId);

  const { data: contacts = [] } = useContactsQuery(tripId);
  const addContactMut = useAddContact(tripId);
  const updateContactMut = useUpdateContact(tripId);
  const deleteContactMut = useDeleteContact(tripId);

  const setItineraryDays = useCallback(
    (days: ItineraryDay[]) => setItineraryDaysCache(days),
    [setItineraryDaysCache],
  );

  const refetchItinerary = useCallback(async () => {
    await refetchItineraryFn();
  }, [refetchItineraryFn]);

  // Mission operations
  const addMission = useCallback(async (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => {
    try { await addMissionMut.mutateAsync(m); } catch { /* toast inside */ }
  }, [addMissionMut]);

  const updateMission = useCallback(async (id: string, updates: Partial<Mission>) => {
    try { await updateMissionMut.mutateAsync({ id, updates }); } catch { /* toast inside */ }
  }, [updateMissionMut]);

  const deleteMission = useCallback(async (id: string) => {
    try { await deleteMissionMut.mutateAsync(id); } catch { /* toast inside */ }
  }, [deleteMissionMut]);

  // Contact operations
  const addContact = useCallback(async (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => {
    try { await addContactMut.mutateAsync(c); } catch { /* toast inside */ }
  }, [addContactMut]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    try { await updateContactMut.mutateAsync({ id, updates }); } catch { /* toast inside */ }
  }, [updateContactMut]);

  const deleteContact = useCallback(async (id: string) => {
    try { await deleteContactMut.mutateAsync(id); } catch { /* toast inside */ }
  }, [deleteContactMut]);

  const value = useMemo(() => ({
    itineraryDays,
    setItineraryDays,
    missions,
    addMission,
    updateMission,
    deleteMission,
    refetchItinerary,
    contacts,
    addContact,
    updateContact,
    deleteContact,
  }), [itineraryDays, setItineraryDays, missions, addMission, updateMission, deleteMission, refetchItinerary, contacts, addContact, updateContact, deleteContact]);

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
