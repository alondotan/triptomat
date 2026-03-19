import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FeatureUsage {
  used: number;
  limit: number;
}

export interface AiUsageSummary {
  tier: string;
  date: string;
  features: {
    url_analysis: FeatureUsage;
    ai_chat: FeatureUsage;
    whatsapp_chat: FeatureUsage;
    email_parsing: FeatureUsage;
  };
}

export function useAiUsage() {
  return useQuery<AiUsageSummary | null>({
    queryKey: ['ai-usage'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;

      const { data, error } = await supabase.rpc('get_usage_summary', {
        p_user_id: session.user.id,
      });

      if (error) {
        console.error('Failed to fetch AI usage:', error);
        return null;
      }

      return data as AiUsageSummary;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
