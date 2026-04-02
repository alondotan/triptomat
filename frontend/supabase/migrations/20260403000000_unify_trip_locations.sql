-- Unify itinerary_locations into trip_locations
-- Phase 1 (safe): adds new columns + backfills data. Old columns kept alive during code transition.
-- Phase 2 (cleanup): see 20260403100000_drop_itinerary_locations.sql

-- ── Step 1: Add new columns to trip_locations ─────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_locations' AND column_name = 'is_temporary') THEN
    ALTER TABLE public.trip_locations ADD COLUMN is_temporary BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_locations' AND column_name = 'notes') THEN
    ALTER TABLE public.trip_locations ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_locations' AND column_name = 'image_url') THEN
    ALTER TABLE public.trip_locations ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Only one temporary location per trip
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_locations_unique_temporary
  ON public.trip_locations(trip_id) WHERE is_temporary = true;

-- ── Step 2: Backfill notes + image_url from non-default itinerary_locations ───

UPDATE public.trip_locations tl
SET
  notes     = COALESCE(il.notes, ''),
  image_url = COALESCE(il.image_url, '')
FROM public.itinerary_locations il
WHERE il.trip_location_id = tl.id
  AND il.is_default = false
  AND (COALESCE(il.notes, '') != '' OR COALESCE(il.image_url, '') != '');

-- ── Step 3: Create a temporary trip_location for each trip's default bucket ───
-- The default itinerary_location (is_default=true) has no trip_location backing it.
-- We create one with is_temporary=true; days currently in the default bucket will
-- point to it after the backfill in step 5.

INSERT INTO public.trip_locations (trip_id, parent_id, name, site_type, sort_order, source, is_temporary)
SELECT il.trip_id, NULL, '', 'temporary', -1, 'manual', true
FROM public.itinerary_locations il
WHERE il.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM public.trip_locations tl2
    WHERE tl2.trip_id = il.trip_id AND tl2.is_temporary = true
  );

-- ── Step 4: Add trip_location_id FK column to itinerary_days ─────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'itinerary_days' AND column_name = 'trip_location_id') THEN
    ALTER TABLE public.itinerary_days ADD COLUMN trip_location_id UUID REFERENCES public.trip_locations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_itinerary_days_trip_location_id ON public.itinerary_days(trip_location_id);

-- ── Step 5: Backfill itinerary_days.trip_location_id ─────────────────────────

-- 5a: Days linked to non-default itinerary_locations → point to the real trip_location
UPDATE public.itinerary_days d
SET trip_location_id = il.trip_location_id
FROM public.itinerary_locations il
WHERE d.itinerary_location_id = il.id
  AND il.is_default = false
  AND il.trip_location_id IS NOT NULL;

-- 5b: Days linked to default itinerary_location → point to the new temporary trip_location
UPDATE public.itinerary_days d
SET trip_location_id = tl.id
FROM public.itinerary_locations il
JOIN public.trip_locations tl ON tl.trip_id = il.trip_id AND tl.is_temporary = true
WHERE d.itinerary_location_id = il.id
  AND il.is_default = true;
