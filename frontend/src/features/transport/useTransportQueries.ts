/**
 * TanStack Query hooks for the Transportation domain.
 *
 * Replaces the manual `useReducer` + `useEffect` + realtime subscription
 * pattern in TransportContext.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Transportation } from '@/types/trip';
import {
  fetchTransportation,
  createTransportation as createTransportationService,
  updateTransportation as updateTransportationService,
  deleteTransportation as deleteTransportationService,
  mergeTwoTransportations,
} from '@/features/transport/transportService';
import { repairItineraryReferences } from '@/features/trip/tripService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useTransportation(tripId: string | undefined) {
  return useTripCollection<Transportation>({
    tripId,
    table: 'transportation',
    queryKey: queryKeys.transport.list(tripId ?? ''),
    fetcher: () => fetchTransportation(tripId!),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useAddTransportation(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>) =>
      createTransportationService(t),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transport.all(tripId ?? '') });
    },
    onError: (error) => {
      console.error('Failed to add transportation:', error);
      toast({ title: 'Error', description: 'Failed to add transportation.', variant: 'destructive' });
    },
  });
}

export function useUpdateTransportation(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (t: Transportation) => updateTransportationService(t.id, t),
    onMutate: async (t) => {
      const key = queryKeys.transport.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transportation[]>(key);
      queryClient.setQueryData<Transportation[]>(key, (old) =>
        (old ?? []).map((x) => (x.id === t.id ? t : x)),
      );
      return { previous };
    },
    onError: (error, _t, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.transport.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to update transportation:', error);
      toast({ title: 'Error', description: 'Failed to update transportation.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transport.all(tripId ?? '') });
    },
  });
}

export function useDeleteTransportation(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteTransportationService(id),
    onMutate: async (id) => {
      const key = queryKeys.transport.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transportation[]>(key);
      queryClient.setQueryData<Transportation[]>(key, (old) => (old ?? []).filter((x) => x.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.transport.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete transportation:', error);
      toast({ title: 'Error', description: 'Failed to delete transportation.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transport.all(tripId ?? '') });
    },
  });
}

export function useMergeTransportation(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ primary, secondary }: { primary: Transportation; secondary: Transportation }) => {
      if (!tripId) throw new Error('No active trip');
      const merged = await mergeTwoTransportations(primary, secondary);
      await repairItineraryReferences(tripId, secondary.id, primary.id, 'transportation');
      return merged;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transport.all(tripId ?? '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(tripId ?? '') });
      toast({ title: 'Merged successfully', description: 'Transport items merged.' });
    },
    onError: (error) => {
      console.error('Failed to merge transportation:', error);
      toast({ title: 'Error', description: 'Merge failed.', variant: 'destructive' });
    },
  });
}
