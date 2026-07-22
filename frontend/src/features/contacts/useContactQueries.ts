/**
 * TanStack Query hooks for the Contacts domain.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Contact } from '@/types/trip';
import {
  fetchContacts,
  createContact as createContactService,
  updateContact as updateContactService,
  deleteContact as deleteContactService,
} from '@/features/contacts/contactService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

export function useContactsQuery(tripId: string | undefined) {
  return useTripCollection<Contact>({
    tripId,
    table: 'contacts',
    queryKey: queryKeys.contacts.list(tripId ?? ''),
    fetcher: () => fetchContacts(tripId!),
  });
}

export function useAddContact(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => createContactService(c),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(tripId ?? '') });
    },
    onError: (error) => {
      console.error('Failed to add contact:', error);
      toast({ title: 'Error', description: 'Failed to add contact.', variant: 'destructive' });
    },
  });
}

export function useUpdateContact(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Contact> }) =>
      updateContactService(id, updates),
    onMutate: async ({ id, updates }) => {
      const key = queryKeys.contacts.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Contact[]>(key);
      queryClient.setQueryData<Contact[]>(key, (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.contacts.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to update contact:', error);
      toast({ title: 'Error', description: 'Failed to update contact.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(tripId ?? '') });
    },
  });
}

export function useDeleteContact(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteContactService(id),
    onMutate: async (id) => {
      const key = queryKeys.contacts.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Contact[]>(key);
      queryClient.setQueryData<Contact[]>(key, (old) => (old ?? []).filter((c) => c.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.contacts.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete contact:', error);
      toast({ title: 'Error', description: 'Failed to delete contact.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(tripId ?? '') });
    },
  });
}
