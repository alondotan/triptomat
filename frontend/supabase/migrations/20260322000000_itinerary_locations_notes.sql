-- Add notes column to itinerary_locations for research-mode free-text notes per location
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'itinerary_locations' AND column_name = 'notes') THEN
    ALTER TABLE public.itinerary_locations ADD COLUMN notes TEXT DEFAULT '';
  END IF;
END $$;
