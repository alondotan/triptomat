-- Add external_id to trip_locations for linking to country JSON boundaries/geoData
-- e.g. "israel/jerusalem-area/jerusalem" matches the key in boundaries object

ALTER TABLE public.trip_locations
  ADD COLUMN external_id TEXT;

-- Index for fast lookup by external_id within a trip
CREATE INDEX idx_trip_locations_external_id
  ON public.trip_locations(trip_id, external_id)
  WHERE external_id IS NOT NULL;

-- Update the seed RPC to store external_id from the JSON node
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
    INSERT INTO public.trip_locations (trip_id, parent_id, name, site_type, sort_order, source, external_id)
    VALUES (
      p_trip_id,
      p_parent_id,
      node->>'site',
      node->>'site_type',
      idx,
      'seed',
      node->>'external_id'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_id;

    IF new_id IS NOT NULL AND node->'sub_sites' IS NOT NULL AND jsonb_typeof(node->'sub_sites') = 'array' THEN
      PERFORM public.seed_trip_locations(p_trip_id, node->'sub_sites', new_id);
    END IF;
    idx := idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
