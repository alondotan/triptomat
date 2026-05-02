-- Migration: ai_chat_metrics table
-- Stores per-call telemetry for the unified AI chat (tokens, latency, tools).

CREATE TABLE IF NOT EXISTS public.ai_chat_metrics (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  trip_id     UUID        REFERENCES public.trips(id) ON DELETE SET NULL,
  mode        TEXT        NOT NULL,
  prompt_tokens   INT,
  cached_tokens   INT,
  output_tokens   INT,
  total_tokens    INT,
  ttft_ms         INT,
  total_ms        INT,
  tool_names      TEXT[],
  source          TEXT
);

ALTER TABLE public.ai_chat_metrics ENABLE ROW LEVEL SECURITY;

-- Admins can read all rows
CREATE POLICY "Admin can read ai_chat_metrics"
  ON public.ai_chat_metrics
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Service role (edge function) inserts — RLS bypass via service key
CREATE POLICY "Service role insert ai_chat_metrics"
  ON public.ai_chat_metrics
  FOR INSERT
  WITH CHECK (true);

-- Index for the admin page time-series queries
CREATE INDEX ai_chat_metrics_created_at_idx ON public.ai_chat_metrics (created_at DESC);
