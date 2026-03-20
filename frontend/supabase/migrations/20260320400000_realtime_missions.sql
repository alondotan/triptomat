-- Add missions table to Supabase realtime publication
-- so frontend can receive live updates from WhatsApp task management
ALTER PUBLICATION supabase_realtime ADD TABLE public.missions;
