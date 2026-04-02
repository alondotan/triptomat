-- Add is_planned flag to trip_locations
-- Distinguishes "knowledge base" locations (all seeded hierarchy) from
-- "planned" locations (subset the user has chosen to actually visit).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_locations' AND column_name = 'is_planned') THEN
    ALTER TABLE public.trip_locations ADD COLUMN is_planned BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Backfill: any non-temporary location that currently has days assigned to it
-- was previously an itinerary_location → mark as planned.
UPDATE public.trip_locations tl
SET is_planned = true
FROM (
  SELECT DISTINCT trip_location_id
  FROM public.itinerary_days
  WHERE trip_location_id IS NOT NULL
) d
WHERE tl.id = d.trip_location_id
  AND tl.is_temporary = false;
