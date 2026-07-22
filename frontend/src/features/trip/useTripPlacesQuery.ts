/**
 * TanStack Query hook for trip places (planned places per trip).
 */

import { useQueryClient } from '@tanstack/react-query';
import { fetchTripPlaces, type TripPlace } from '@/features/trip/tripPlaceService';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';

export function useTripPlaces(tripId: string | undefined) {
  return useTripCollection<TripPlace>({
    tripId,
    table: 'trip_places',
    queryKey: queryKeys.trips.places(tripId ?? ''),
    fetcher: () => fetchTripPlaces(tripId!),
  });
}

export function useReloadTripPlaces(tripId: string | undefined) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.trips.places(tripId ?? '') });
  };
}
