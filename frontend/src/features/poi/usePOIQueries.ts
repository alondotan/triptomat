/**
 * TanStack Query hooks for the POI domain.
 *
 * Replaces the manual `useReducer` + `useEffect` + realtime subscription
 * pattern in POIContext. The query cache is the single source of truth;
 * realtime invalidations refetch transparently.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PointOfInterest } from '@/types/trip';
import {
  fetchPOIs,
  createOrMergePOI,
  updatePOI as updatePOIService,
  deletePOI as deletePOIService,
  mergeTwoPOIs,
} from '@/features/poi/poiService';
import { repairItineraryReferences } from '@/features/trip/tripService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** All POIs for a trip — auto-refreshes on realtime changes. */
export function usePOIs(tripId: string | undefined) {
  return useTripCollection<PointOfInterest>({
    tripId,
    table: 'points_of_interest',
    queryKey: queryKeys.poi.list(tripId ?? ''),
    fetcher: () => fetchPOIs(tripId!),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a POI, or merge into an existing one if a duplicate is detected.
 * Returns `{ poi, merged }`.
 */
export function useAddPOI(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>) =>
      createOrMergePOI(poi),
    onSuccess: ({ merged, poi }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poi.all(tripId ?? '') });
      if (merged) {
        toast({
          title: 'Merged with existing item',
          description: `"${poi.name}" already exists — your data was merged into it.`,
        });
      }
    },
    onError: (error) => {
      console.error('Failed to add POI:', error);
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
    },
  });
}

/** Update a POI by id. Cache is updated optimistically and reconciled on realtime. */
export function useUpdatePOI(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (poi: PointOfInterest) => updatePOIService(poi.id, poi),
    onMutate: async (poi) => {
      const key = queryKeys.poi.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PointOfInterest[]>(key);
      queryClient.setQueryData<PointOfInterest[]>(key, (old) =>
        (old ?? []).map((p) => (p.id === poi.id ? poi : p)),
      );
      return { previous };
    },
    onError: (error, _poi, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.poi.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to update POI:', error);
      toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poi.all(tripId ?? '') });
    },
  });
}

/** Delete a POI by id. Optimistic. */
export function useDeletePOI(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (poiId: string) => deletePOIService(poiId),
    onMutate: async (poiId) => {
      const key = queryKeys.poi.list(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PointOfInterest[]>(key);
      queryClient.setQueryData<PointOfInterest[]>(key, (old) =>
        (old ?? []).filter((p) => p.id !== poiId),
      );
      return { previous };
    },
    onError: (error, _poiId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.poi.list(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete POI:', error);
      toast({ title: 'Error', description: 'Failed to delete item.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poi.all(tripId ?? '') });
    },
  });
}

/** Merge two POIs. Primary survives; secondary is deleted. Repairs itinerary refs. */
export function useMergePOIs(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ primary, secondary }: { primary: PointOfInterest; secondary: PointOfInterest }) => {
      if (!tripId) throw new Error('No active trip');
      const merged = await mergeTwoPOIs(primary, secondary);
      await repairItineraryReferences(tripId, secondary.id, primary.id, 'poi');
      return { merged, secondaryName: secondary.name, primaryName: primary.name };
    },
    onSuccess: ({ secondaryName, primaryName }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poi.all(tripId ?? '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all(tripId ?? '') });
      toast({
        title: 'Merged successfully',
        description: `"${secondaryName}" merged into "${primaryName}"`,
      });
    },
    onError: (error) => {
      console.error('Failed to merge POIs:', error);
      toast({ title: 'Error', description: 'Merge failed.', variant: 'destructive' });
    },
  });
}
