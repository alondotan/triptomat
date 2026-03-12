-- Fix RLS policy: use auth.jwt() app_metadata instead of querying auth.users
DROP POLICY IF EXISTS "Admin can read pipeline events" ON public.pipeline_events;

CREATE POLICY "Admin can read pipeline events"
  ON public.pipeline_events FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
