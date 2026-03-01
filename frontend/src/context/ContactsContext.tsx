import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Contact } from '@/types/trip';
import * as tripService from '@/services/tripService';
import { useToast } from '@/hooks/use-toast';
import { useActiveTrip } from './ActiveTripContext';

// State
interface ContactsState {
  contacts: Contact[];
}

type ContactsAction =
  | { type: 'SET_CONTACTS'; payload: Contact[] }
  | { type: 'ADD_CONTACT'; payload: Contact }
  | { type: 'UPDATE_CONTACT'; payload: Contact }
  | { type: 'DELETE_CONTACT'; payload: string };

function contactsReducer(state: ContactsState, action: ContactsAction): ContactsState {
  switch (action.type) {
    case 'SET_CONTACTS':
      return { contacts: action.payload };
    case 'ADD_CONTACT':
      return { contacts: [action.payload, ...state.contacts] };
    case 'UPDATE_CONTACT':
      return { contacts: state.contacts.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CONTACT':
      return { contacts: state.contacts.filter(c => c.id !== action.payload) };
    default:
      return state;
  }
}

// Context type
interface ContactsContextType {
  contacts: Contact[];
  addContact: (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { activeTrip, refreshKey } = useActiveTrip();
  const [state, dispatch] = useReducer(contactsReducer, { contacts: [] });

  // Load contacts when active trip changes
  useEffect(() => {
    if (activeTrip) {
      tripService.fetchContacts(activeTrip.id)
        .then(contacts => dispatch({ type: 'SET_CONTACTS', payload: contacts }))
        .catch(e => console.error('Failed to load contacts:', e));
    } else {
      dispatch({ type: 'SET_CONTACTS', payload: [] });
    }
  }, [activeTrip?.id, refreshKey]);

  const addContact = useCallback(async (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newC = await tripService.createContact(c);
      dispatch({ type: 'ADD_CONTACT', payload: newC });
    } catch (error) {
      console.error('Failed to add contact:', error);
      toast({ title: 'Error', description: 'Failed to add contact.', variant: 'destructive' });
    }
  }, [toast]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    try {
      await tripService.updateContact(id, updates);
      const existing = state.contacts.find(c => c.id === id);
      if (existing) dispatch({ type: 'UPDATE_CONTACT', payload: { ...existing, ...updates } });
    } catch (error) {
      console.error('Failed to update contact:', error);
      toast({ title: 'Error', description: 'Failed to update contact.', variant: 'destructive' });
    }
  }, [state.contacts, toast]);

  const deleteContact = useCallback(async (id: string) => {
    try {
      await tripService.deleteContact(id);
      dispatch({ type: 'DELETE_CONTACT', payload: id });
    } catch (error) {
      console.error('Failed to delete contact:', error);
      toast({ title: 'Error', description: 'Failed to delete contact.', variant: 'destructive' });
    }
  }, [toast]);

  const value = useMemo(() => ({
    contacts: state.contacts,
    addContact,
    updateContact,
    deleteContact,
  }), [state.contacts, addContact, updateContact, deleteContact]);

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const context = useContext(ContactsContext);
  if (!context) throw new Error('useContacts must be used within a ContactsProvider');
  return context;
}
