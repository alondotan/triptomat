-- ============================================================
-- Add trip_places table and migrate from is_planned pattern
-- ============================================================
-- trip_places: the flat list of places a user plans to visit on a trip.
-- Each place is linked to a node in trip_locations (the geo hierarchy).
-- itinerary_days.trip_place_id replaces trip_location_id.
-- ============================================================

-- 1) Create trip_places
CREATE TABLE IF NOT EXISTS public.trip_places (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  trip_location_id UUID NOT NULL REFERENCES public.trip_locations(id) ON DELETE CASCADE,
  potential_activity_ids JSONB NOT NULL DEFAULT '[]',
  notes         TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS trip_places_trip_id_idx ON public.trip_places(trip_id);

-- RLS
ALTER TABLE public.trip_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trip places"
  ON public.trip_places
  FOR ALL
  USING (
    trip_id IN (
      SELECT id FROM public.trips WHERE user_id = auth.uid()
      UNION
      SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_places;

-- 2) Backfill trip_places from existing is_planned trip_locations
INSERT INTO public.trip_places (trip_id, trip_location_id, image_url, sort_order, created_at, updated_at)
SELECT
  tl.trip_id,
  tl.id,
  COALESCE(tl.image_url, ''),
  COALESCE(tl.sort_order, 0),
  now(),
  now()
FROM public.trip_locations tl
WHERE tl.is_planned = true
  AND (tl.is_temporary IS NULL OR tl.is_temporary = false);

-- 3) Add trip_place_id to itinerary_days
ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS trip_place_id UUID REFERENCES public.trip_places(id) ON DELETE SET NULL;

-- 4) Backfill trip_place_id from trip_location_id via the new trip_places rows
UPDATE public.itinerary_days d
SET trip_place_id = tp.id
FROM public.trip_places tp
WHERE d.trip_location_id = tp.trip_location_id
  AND d.trip_id = tp.trip_id;

-- 5) Clean up trip_locations: drop is_planned, is_temporary, image_url
--    (notes stays — it's on trip_places now but may also be useful on the location node)
ALTER TABLE public.trip_locations
  DROP COLUMN IF EXISTS is_planned,
  DROP COLUMN IF EXISTS is_temporary,
  DROP COLUMN IF EXISTS image_url;

-- 6) Drop trip_location_id from itinerary_days
ALTER TABLE public.itinerary_days
  DROP COLUMN IF EXISTS trip_location_id;
