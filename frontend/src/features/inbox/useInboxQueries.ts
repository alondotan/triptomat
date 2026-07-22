/**
 * TanStack Query hooks for inbox-related data:
 *  - source recommendations (per trip, with realtime)
 *  - webhook token (singleton per user)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SourceRecommendation } from '@/types/webhook';
import { fetchTripRecommendations, deleteRecommendation as deleteRecommendationService } from '@/features/inbox/recommendationService';
import { supabase } from '@/integrations/supabase/client';
import { useTripCollection } from '@/shared/queries/useTripCollection';
import { queryKeys } from '@/shared/queries/keys';
import { useToast } from '@/shared/hooks/use-toast';

// ---------------------------------------------------------------------------
// Recommendations (per trip, with realtime)
// ---------------------------------------------------------------------------

export function useTripRecommendations(tripId: string | undefined) {
  return useTripCollection<SourceRecommendation>({
    tripId,
    table: 'source_recommendations',
    queryKey: queryKeys.inbox.recommendations(tripId ?? ''),
    fetcher: () => fetchTripRecommendations(tripId!),
  });
}

export function useDeleteRecommendation(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteRecommendationService(id),
    onMutate: async (id) => {
      const key = queryKeys.inbox.recommendations(tripId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SourceRecommendation[]>(key);
      queryClient.setQueryData<SourceRecommendation[]>(key, (old) => (old ?? []).filter((r) => r.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.inbox.recommendations(tripId ?? ''), context.previous);
      }
      console.error('Failed to delete recommendation:', error);
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.recommendations(tripId ?? '') });
    },
  });
}

// ---------------------------------------------------------------------------
// Webhook token (used by share-target, sources, inbox forms)
// ---------------------------------------------------------------------------

export function useWebhookToken() {
  return useQuery<string | null>({
    queryKey: queryKeys.inbox.webhookToken(),
    queryFn: async () => {
      const { data } = await supabase.from('webhook_tokens').select('token').single();
      return (data?.token as string) ?? null;
    },
    staleTime: 60 * 60_000, // tokens are long-lived
  });
}
