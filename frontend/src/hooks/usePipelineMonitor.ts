import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PipelineEvent {
  id: string;
  job_id: string;
  source_url: string | null;
  source_type: string | null;
  stage: string;
  status: string;
  title: string | null;
  image: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PipelineJob {
  jobId: string;
  sourceUrl: string | null;
  sourceType: string | null;
  title: string | null;
  image: string | null;
  currentStage: string;
  currentStatus: string;
  events: PipelineEvent[];
  startedAt: string;
  lastUpdatedAt: string;
}

const STAGE_ORDER: Record<string, number> = {
  gateway: 0,
  downloader: 1,
  worker: 2,
  mail_handler: 1,
  webhook: 3,
};

function buildJobs(events: PipelineEvent[]): PipelineJob[] {
  const grouped = new Map<string, PipelineEvent[]>();
  for (const ev of events) {
    const list = grouped.get(ev.job_id) || [];
    list.push(ev);
    grouped.set(ev.job_id, list);
  }

  const jobs: PipelineJob[] = [];
  for (const [jobId, jobEvents] of grouped) {
    // Sort events by time
    jobEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Pick most advanced stage
    const latest = jobEvents[jobEvents.length - 1];
    const firstWithMeta = jobEvents.find(e => e.source_url || e.title);

    jobs.push({
      jobId,
      sourceUrl: firstWithMeta?.source_url || latest.source_url,
      sourceType: firstWithMeta?.source_type || latest.source_type,
      title: firstWithMeta?.title || latest.title,
      image: firstWithMeta?.image || latest.image,
      currentStage: latest.stage,
      currentStatus: latest.status,
      events: jobEvents,
      startedAt: jobEvents[0].created_at,
      lastUpdatedAt: latest.created_at,
    });
  }

  // Sort by most recent first
  jobs.sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
  return jobs;
}

type TimeRange = '1h' | '6h' | '24h';

export function usePipelineMonitor(timeRange: TimeRange = '24h') {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const eventsRef = useRef<PipelineEvent[]>([]);

  const hoursMap: Record<TimeRange, number> = { '1h': 1, '6h': 6, '24h': 24 };

  const fetchEvents = useCallback(async () => {
    const since = new Date(Date.now() - hoursMap[timeRange] * 3600_000).toISOString();
    const { data, error } = await supabase
      .from('pipeline_events')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Failed to fetch pipeline events:', error);
      setLoading(false);
      return;
    }

    const typed = (data || []) as unknown as PipelineEvent[];
    eventsRef.current = typed;
    setEvents(typed);
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-events-rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pipeline_events',
      }, (payload) => {
        const newEvent = payload.new as unknown as PipelineEvent;
        eventsRef.current = [newEvent, ...eventsRef.current];
        setEvents([...eventsRef.current]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const jobs = buildJobs(events);

  return { jobs, events, loading, refetch: fetchEvents };
}
