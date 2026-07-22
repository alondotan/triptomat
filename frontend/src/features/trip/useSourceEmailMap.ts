import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SourceEmailEntry {
  permalink?: string;
  subject?: string;
}
type SourceEmailMap = Record<string, SourceEmailEntry>;

/**
 * Map of email_id → { permalink, subject } for all linked source emails of a trip.
 * Used by features that show "view in Gmail" links from POIs / transports.
 */
export function useSourceEmailMap(tripId: string | undefined) {
  return useQuery<SourceEmailMap>({
    queryKey: ['trips', tripId ?? '', 'source-email-map'] as const,
    enabled: !!tripId,
    queryFn: async () => {
      const { data: emails } = await supabase
        .from('source_emails')
        .select('id, source_email_info')
        .eq('trip_id', tripId!)
        .eq('status', 'linked');

      const map: SourceEmailMap = {};
      for (const email of (emails || [])) {
        const info = email.source_email_info as { email_permalink?: string; subject?: string } | undefined;
        map[email.id] = { permalink: info?.email_permalink, subject: info?.subject };
      }
      return map;
    },
    staleTime: 5 * 60_000,
  });
}
