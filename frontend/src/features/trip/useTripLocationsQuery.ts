/**
 * TanStack Query hook for trip locations + place hierarchy enrichment.
 *
 * Trip locations come from the DB (`trip_locations` table). The hierarchy is
 * then enriched with Hebrew names + descriptions from per-country JSON
 * (`/data/countries/<id>.json`), and rebuilt into a tree for UI consumption.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchTripLocations,
  buildLocationTree,
  loadCountryData,
  buildDescriptionMap,
  type TripLocation,
} from '@/features/trip/tripLocationService';
import type { SiteNode } from '@/features/geodata/useCountrySites';
import { useTripTableRealtime } from '@/shared/queries/useTripRealtime';
import { queryKeys } from '@/shared/queries/keys';

interface TripLocationsData {
  flat: TripLocation[];
  tree: SiteNode[];
}

export function useTripLocations(tripId: string | undefined, countries: string[] = []) {
  const queryKey = [...queryKeys.trips.locations(tripId ?? ''), countries.slice().sort().join(',')] as const;
  useTripTableRealtime('trip_locations', tripId, queryKey);

  return useQuery<TripLocationsData>({
    queryKey,
    enabled: !!tripId,
    queryFn: async () => {
      const flat = await fetchTripLocations(tripId!);
      const countryResults = countries.length > 0
        ? await Promise.all(countries.map(c => loadCountryData(c)))
        : [];
      const descMap = countryResults.length > 0 ? buildDescriptionMap(countryResults) : undefined;
      const tree = buildLocationTree(flat, descMap);
      return { flat, tree };
    },
    staleTime: 60_000,
  });
}

/** Returns a function that invalidates the trip locations query for a manual reload. */
export function useReloadTripLocations(tripId: string | undefined) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.trips.locations(tripId ?? '') });
  };
}
