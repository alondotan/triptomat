-- Enable real-time for points_of_interest, transportation, and itinerary_days
-- so the frontend receives live updates when webhooks insert/update rows.

ALTER TABLE public.points_of_interest REPLICA IDENTITY FULL;
ALTER TABLE public.transportation REPLICA IDENTITY FULL;
ALTER TABLE public.itinerary_days REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.points_of_interest;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transportation;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itinerary_days;
