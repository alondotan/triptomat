-- Itinerary locations: explicit location grouping for trip days
-- Each itinerary_location links a trip to a trip_location (or is the default "General" bucket)

CREATE TABLE public.itinerary_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  trip_location_id UUID REFERENCES public.trip_locations(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_itinerary_locations_trip_id ON public.itinerary_locations(trip_id);

-- Only one default per trip
CREATE UNIQUE INDEX idx_itinerary_locations_default
  ON public.itinerary_locations(trip_id) WHERE is_default = true;

-- No duplicate trip_location per trip
CREATE UNIQUE INDEX idx_itinerary_locations_unique_location
  ON public.itinerary_locations(trip_id, trip_location_id)
  WHERE trip_location_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER update_itinerary_locations_updated_at
  BEFORE UPDATE ON public.itinerary_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS (public access for MVP, consistent with itinerary_days)
ALTER TABLE public.itinerary_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on itinerary_locations"
  ON public.itinerary_locations FOR SELECT USING (true);

CREATE POLICY "Allow public insert on itinerary_locations"
  ON public.itinerary_locations FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on itinerary_locations"
  ON public.itinerary_locations FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on itinerary_locations"
  ON public.itinerary_locations FOR DELETE USING (true);

-- Realtime support
ALTER TABLE public.itinerary_locations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itinerary_locations;

-- ── Add FK column to itinerary_days ──────────────────────────────────────────

ALTER TABLE public.itinerary_days
  ADD COLUMN itinerary_location_id UUID REFERENCES public.itinerary_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_itinerary_days_location ON public.itinerary_days(itinerary_location_id);

-- ── Backfill existing data ───────────────────────────────────────────────────

-- 1) Create default "General" itinerary_location for each trip that has itinerary_days
INSERT INTO public.itinerary_locations (trip_id, trip_location_id, is_default, sort_order)
SELECT DISTINCT trip_id, NULL, true, 0
FROM public.itinerary_days
ON CONFLICT DO NOTHING;

-- 2) For each distinct non-empty location_context per trip, find matching trip_location
--    and create an itinerary_location referencing it
DO $$
DECLARE
  rec RECORD;
  loc_id UUID;
  itin_loc_id UUID;
BEGIN
  FOR rec IN
    SELECT DISTINCT d.trip_id, d.location_context
    FROM public.itinerary_days d
    WHERE d.location_context IS NOT NULL AND d.location_context != ''
  LOOP
    -- Find matching trip_location by name (case-insensitive)
    SELECT id INTO loc_id
    FROM public.trip_locations
    WHERE trip_id = rec.trip_id AND lower(name) = lower(rec.location_context)
    LIMIT 1;

    IF loc_id IS NOT NULL THEN
      -- Create itinerary_location if it doesn't exist
      INSERT INTO public.itinerary_locations (trip_id, trip_location_id, is_default, sort_order)
      VALUES (rec.trip_id, loc_id, false, 1)
      ON CONFLICT (trip_id, trip_location_id) WHERE trip_location_id IS NOT NULL DO NOTHING
      RETURNING id INTO itin_loc_id;

      -- If ON CONFLICT hit, fetch the existing one
      IF itin_loc_id IS NULL THEN
        SELECT id INTO itin_loc_id
        FROM public.itinerary_locations
        WHERE trip_id = rec.trip_id AND trip_location_id = loc_id;
      END IF;

      -- Update matching itinerary_days
      UPDATE public.itinerary_days
      SET itinerary_location_id = itin_loc_id
      WHERE trip_id = rec.trip_id
        AND lower(location_context) = lower(rec.location_context);
    END IF;
  END LOOP;
END $$;

-- 3) Assign remaining unassigned days to their trip's default location
UPDATE public.itinerary_days d
SET itinerary_location_id = il.id
FROM public.itinerary_locations il
WHERE il.trip_id = d.trip_id
  AND il.is_default = true
  AND d.itinerary_location_id IS NULL;
