-- Pipeline events table for real-time monitoring of job stages
CREATE TABLE public.pipeline_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id      text NOT NULL,
  source_url  text,
  source_type text,                     -- video, web, maps, text, email
  stage       text NOT NULL,            -- gateway, downloader, worker, mail_handler, webhook
  status      text NOT NULL DEFAULT 'started', -- started, completed, failed
  title       text,                     -- human-readable title (video title, email subject, etc.)
  image       text,                     -- thumbnail URL
  metadata    jsonb DEFAULT '{}',       -- stage-specific output data
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_pipeline_events_job_id ON public.pipeline_events (job_id);
CREATE INDEX idx_pipeline_events_created_at ON public.pipeline_events (created_at DESC);

-- Enable real-time
ALTER TABLE public.pipeline_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_events;

-- RLS: admin-only read, edge functions write via service role
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read pipeline events"
  ON public.pipeline_events FOR SELECT
  USING (
    (SELECT raw_user_meta_data ->> 'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- Auto-cleanup: delete events older than 7 days (runs on each insert via trigger)
CREATE OR REPLACE FUNCTION public.cleanup_old_pipeline_events()
RETURNS trigger AS $$
BEGIN
  DELETE FROM public.pipeline_events
  WHERE created_at < now() - interval '7 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_pipeline_events
  AFTER INSERT ON public.pipeline_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_old_pipeline_events();
