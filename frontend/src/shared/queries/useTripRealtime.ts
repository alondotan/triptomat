import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to Supabase realtime for a single table filtered by `trip_id`,
 * and invalidates the given query key when any row changes.
 *
 * This replaces the manual `useEffect → fetch → dispatch` pattern that
 * previously lived in every domain Context. The query cache becomes the
 * single source of truth.
 */
export function useTripTableRealtime(
  table: string,
  tripId: string | undefined,
  queryKey: readonly unknown[],
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`${table}-realtime-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `trip_id=eq.${tripId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime] ${table} subscription error for trip ${tripId}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKey is a stable readonly tuple — the items inside it (table, tripId) are
    // the actual dependencies, but we include the key array for completeness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, tripId, queryClient, ...queryKey]);
}
