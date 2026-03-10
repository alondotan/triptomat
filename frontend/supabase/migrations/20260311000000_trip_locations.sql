-- Trip-specific location tree: each trip gets its own hierarchy of locations
-- (country → region → city → neighborhood etc.)

CREATE TABLE public.trip_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.trip_locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  site_type TEXT NOT NULL,  -- country, city, neighborhood, region, etc.
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'seed',  -- seed | manual | webhook
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_trip_locations_trip_id ON public.trip_locations(trip_id);
CREATE INDEX idx_trip_locations_parent_id ON public.trip_locations(parent_id);

-- Unique constraint: no duplicate siblings (handles NULL parent_id correctly)
CREATE UNIQUE INDEX idx_trip_locations_unique_child
  ON public.trip_locations(trip_id, parent_id, name)
  WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX idx_trip_locations_unique_root
  ON public.trip_locations(trip_id, name)
  WHERE parent_id IS NULL;

-- Updated_at trigger
CREATE TRIGGER update_trip_locations_updated_at
  BEFORE UPDATE ON public.trip_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.trip_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trip locations"
  ON public.trip_locations FOR SELECT
  USING (public.owns_trip(trip_id));

CREATE POLICY "Users can create trip locations"
  ON public.trip_locations FOR INSERT
  WITH CHECK (public.owns_trip(trip_id));

CREATE POLICY "Users can update own trip locations"
  ON public.trip_locations FOR UPDATE
  USING (public.owns_trip(trip_id));

CREATE POLICY "Users can delete own trip locations"
  ON public.trip_locations FOR DELETE
  USING (public.owns_trip(trip_id));

-- Realtime support (for webhook-added locations to appear live)
ALTER TABLE public.trip_locations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_locations;

-- RPC function: seed locations from a JSON hierarchy in one transaction
CREATE OR REPLACE FUNCTION public.seed_trip_locations(
  p_trip_id UUID,
  p_locations JSONB,
  p_parent_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  node JSONB;
  new_id UUID;
  idx INTEGER := 0;
BEGIN
  FOR node IN SELECT * FROM jsonb_array_elements(p_locations)
  LOOP
    INSERT INTO public.trip_locations (trip_id, parent_id, name, site_type, sort_order, source)
    VALUES (p_trip_id, p_parent_id, node->>'site', node->>'site_type', idx, 'seed')
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_id;

    IF new_id IS NOT NULL AND node->'sub_sites' IS NOT NULL AND jsonb_typeof(node->'sub_sites') = 'array' THEN
      PERFORM public.seed_trip_locations(p_trip_id, node->'sub_sites', new_id);
    END IF;
    idx := idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
