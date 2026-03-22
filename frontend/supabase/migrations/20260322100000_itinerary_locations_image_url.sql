-- Add image_url column to itinerary_locations for persisted location image
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'itinerary_locations' AND column_name = 'image_url') THEN
    ALTER TABLE public.itinerary_locations ADD COLUMN image_url TEXT DEFAULT '';
  END IF;
END $$;
