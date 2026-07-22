/**
 * TanStack Query hooks for the Itinerary Days domain.
 *
 * Replaces the manual itinerary-day fetching in ItineraryContext. The
 * `setItineraryDays` setter from the legacy context is preserved by writing
 * directly to the query cache.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ItineraryDay } from '@/types/trip';
import {
  fetchItineraryDays,
  createItineraryDay as createItineraryDayService,
  updateItineraryDay as updateItineraryDayService,
  deleteItineraryDay as deleteItineraryDayService,
} from '@/features/itinerary/itineraryService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useItineraryDays(tripId: string | undefined) {
  return useTripCollection<ItineraryDay>({
    tripId,
    table: 'itinerary_days',
    queryKey: queryKeys.itinerary.days(tripId ?? ''),
    fetcher: () => fetchItineraryDays(tripId!),
  });
}

/**
 * Returns a setter that writes directly to the itinerary-days cache. Use for
 * optimistic UI updates that don't hit the DB (e.g. intermediate drag state).
 */
export function useSetItineraryDays(tripId: string | undefined) {
  const queryClient = useQueryClient();
  return (days: ItineraryDay[] | ((prev: ItineraryDay[]) => ItineraryDay[])) => {
    queryClient.setQueryData<ItineraryDay[]>(
      queryKeys.itinerary.days(tripId ?? ''),
      typeof days === 'function' ? (old) => days(old ?? []) : days,
    );
  };
}

/**
 * Returns a function that refetches itinerary days from the DB.
 * Replaces the legacy `refetchItinerary` callback.
 */
export function useRefetchItinerary(tripId: string | undefined) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(tripId ?? '') });
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateItineraryDay(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (day: Omit<ItineraryDay, 'id' | 'createdAt' | 'updatedAt'>) =>
      createItineraryDayService(day),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(tripId ?? '') });
    },
    onError: (error) => {
      console.error('Failed to create itinerary day:', error);
      toast({ title: 'Error', description: 'Failed to create day.', variant: 'destructive' });
    },
  });
}

export function useUpdateItineraryDay(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ItineraryDay> }) =>
      updateItineraryDayService(id, updates),
    onMutate: async ({ id, updates }) => {
      const key = queryKeys.itinerary.days(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItineraryDay[]>(key);
      queryClient.setQueryData<ItineraryDay[]>(key, (old) =>
        (old ?? []).map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.itinerary.days(tripId ?? ''), context.previous);
      }
      console.error('Failed to update itinerary day:', error);
      toast({ title: 'Error', description: 'Failed to update day.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(tripId ?? '') });
    },
  });
}

export function useDeleteItineraryDay(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteItineraryDayService(id),
    onMutate: async (id) => {
      const key = queryKeys.itinerary.days(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItineraryDay[]>(key);
      queryClient.setQueryData<ItineraryDay[]>(key, (old) => (old ?? []).filter((d) => d.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.itinerary.days(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete itinerary day:', error);
      toast({ title: 'Error', description: 'Failed to delete day.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(tripId ?? '') });
    },
  });
}
