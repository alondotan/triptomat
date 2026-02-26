-- Enable real-time for source_emails and source_recommendations
-- so the frontend receives live updates when webhooks insert/update rows.

-- REPLICA IDENTITY FULL is needed for UPDATE events to carry old+new row data.
ALTER TABLE public.source_emails REPLICA IDENTITY FULL;
ALTER TABLE public.source_recommendations REPLICA IDENTITY FULL;

-- Add tables to the Supabase real-time publication.
ALTER PUBLICATION supabase_realtime ADD TABLE public.source_emails;
ALTER PUBLICATION supabase_realtime ADD TABLE public.source_recommendations;
