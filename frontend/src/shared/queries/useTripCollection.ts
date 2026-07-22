import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTripTableRealtime } from './useTripRealtime';

/**
 * Generic hook for trip-scoped collection data.
 *
 * Wraps `useQuery` + Supabase realtime invalidation in a single call. Replaces
 * the boilerplate `useReducer` + `useEffect` + manual realtime subscription
 * pattern that used to live in every domain Context.
 *
 * @example
 * const { data: pois = [], isLoading } = useTripCollection({
 *   tripId,
 *   table: 'points_of_interest',
 *   queryKey: queryKeys.poi.list(tripId ?? ''),
 *   fetcher: () => fetchPOIs(tripId!),
 * });
 */
export function useTripCollection<T>(opts: {
  tripId: string | undefined;
  table: string;
  queryKey: readonly unknown[];
  fetcher: () => Promise<T[]>;
  /** Stale time in ms (default: 30s — collections are kept fresh by realtime). */
  staleTime?: number;
  enabled?: boolean;
}): UseQueryResult<T[]> {
  const { tripId, table, queryKey, fetcher, staleTime = 30_000, enabled = true } = opts;

  useTripTableRealtime(table, tripId, queryKey);

  return useQuery<T[]>({
    queryKey,
    queryFn: fetcher,
    enabled: !!tripId && enabled,
    staleTime,
  });
}
