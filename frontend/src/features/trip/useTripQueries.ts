/**
 * TanStack Query hooks for the Trips domain.
 *
 * Trips are special: they are not scoped to a tripId (they ARE the trips).
 * The list is loaded once and refreshed via invalidation on mutations.
 *
 * Realtime is intentionally not subscribed here — trip lifecycle changes are
 * always user-initiated locally; cross-device sync isn't a current product
 * requirement, so the cost (yet another channel) isn't worth it. Add later
 * via the same `useTripTableRealtime` helper if needed.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trip } from '@/types/trip';
import {
  fetchTrips,
  createTrip as createTripService,
  updateTrip as updateTripService,
  deleteTrip as deleteTripService,
} from '@/features/trip/tripService';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useTrips() {
  return useQuery<Trip[]>({
    queryKey: queryKeys.trips.list(),
    queryFn: fetchTrips,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>) => createTripService(data),
    onSuccess: (trip) => {
      queryClient.setQueryData<Trip[]>(queryKeys.trips.list(), (old) => [trip, ...(old ?? [])]);
      toast({ title: 'Trip Created', description: `"${trip.name}" has been created.` });
    },
    onError: (error) => {
      console.error('Failed to create trip:', error);
      toast({ title: 'Error', description: 'Failed to create trip.', variant: 'destructive' });
    },
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>> }) =>
      updateTripService(id, updates),
    onMutate: async ({ id, updates }) => {
      const key = queryKeys.trips.list();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Trip[]>(key);
      queryClient.setQueryData<Trip[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: 'Trip updated' });
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.trips.list(), context.previous);
      console.error('Failed to update trip:', error);
      toast({ title: 'Error', description: 'Failed to update trip.', variant: 'destructive' });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteTripService(id),
    onMutate: async (id) => {
      const key = queryKeys.trips.list();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Trip[]>(key);
      queryClient.setQueryData<Trip[]>(key, (old) => (old ?? []).filter((t) => t.id !== id));
      return { previous };
    },
    onSuccess: () => {
      toast({ title: 'Trip Deleted' });
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.trips.list(), context.previous);
      console.error('Failed to delete trip:', error);
      toast({ title: 'Error', description: 'Failed to delete trip.', variant: 'destructive' });
    },
  });
}
