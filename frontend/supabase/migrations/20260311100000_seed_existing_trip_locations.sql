-- One-time migration: Seed trip_locations for all existing trips that don't have locations yet.
-- This calls seed_trip_locations for each trip using a JSON literal of its countries from country-sites.json.
-- We identify trips by their countries and seed them accordingly.

-- First, seed from trip countries using the seed_trip_locations RPC function.
-- Since we can't load JSON files from SQL, we insert country nodes directly.
-- The approach: for each trip, check if it already has locations; if not, insert its country names as root nodes.
-- The webhook sync will fill in sub-locations when webhooks fire next.

DO $$
DECLARE
  trip_rec RECORD;
  country_name TEXT;
  existing_count INTEGER;
BEGIN
  FOR trip_rec IN SELECT id, countries FROM public.trips WHERE countries IS NOT NULL AND array_length(countries, 1) > 0
  LOOP
    -- Check if trip already has locations
    SELECT COUNT(*) INTO existing_count FROM public.trip_locations WHERE trip_id = trip_rec.id;
    IF existing_count > 0 THEN
      CONTINUE;
    END IF;

    -- Insert each country as a root node
    FOREACH country_name IN ARRAY trip_rec.countries
    LOOP
      INSERT INTO public.trip_locations (trip_id, parent_id, name, site_type, sort_order, source)
      VALUES (trip_rec.id, NULL, country_name, 'country', 0, 'seed')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Now sync sites_hierarchy from source_recommendations into trip_locations.
-- We extract the hierarchy JSON and walk it, inserting missing nodes.

CREATE OR REPLACE FUNCTION public._migrate_sync_hierarchy(
  p_trip_id UUID,
  p_hierarchy JSONB,
  p_parent_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  node JSONB;
  existing_id UUID;
  new_id UUID;
BEGIN
  IF p_hierarchy IS NULL OR jsonb_typeof(p_hierarchy) != 'array' THEN
    RETURN;
  END IF;

  FOR node IN SELECT * FROM jsonb_array_elements(p_hierarchy)
  LOOP
    -- Try to find existing node by name in this trip
    SELECT id INTO existing_id
    FROM public.trip_locations
    WHERE trip_id = p_trip_id AND LOWER(name) = LOWER(node->>'site')
    LIMIT 1;

    IF existing_id IS NULL THEN
      -- Insert new node
      INSERT INTO public.trip_locations (trip_id, parent_id, name, site_type, sort_order, source)
      VALUES (p_trip_id, p_parent_id, node->>'site', node->>'site_type', 0, 'webhook')
      ON CONFLICT DO NOTHING
      RETURNING id INTO new_id;

      IF new_id IS NOT NULL AND node->'sub_sites' IS NOT NULL AND jsonb_typeof(node->'sub_sites') = 'array' THEN
        PERFORM public._migrate_sync_hierarchy(p_trip_id, node->'sub_sites', new_id);
      END IF;
    ELSE
      -- Node exists, recurse into children
      IF node->'sub_sites' IS NOT NULL AND jsonb_typeof(node->'sub_sites') = 'array' THEN
        PERFORM public._migrate_sync_hierarchy(p_trip_id, node->'sub_sites', existing_id);
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Sync from source_recommendations
DO $$
DECLARE
  rec RECORD;
  hierarchy JSONB;
BEGIN
  FOR rec IN
    SELECT sr.trip_id, sr.analysis
    FROM public.source_recommendations sr
    WHERE sr.trip_id IS NOT NULL
      AND sr.status = 'linked'
      AND sr.analysis IS NOT NULL
      AND sr.analysis->'sites_hierarchy' IS NOT NULL
  LOOP
    hierarchy := rec.analysis->'sites_hierarchy';
    IF jsonb_typeof(hierarchy) = 'array' AND jsonb_array_length(hierarchy) > 0 THEN
      PERFORM public._migrate_sync_hierarchy(rec.trip_id, hierarchy);
    END IF;
  END LOOP;
END $$;

-- Sync from source_emails
DO $$
DECLARE
  rec RECORD;
  hierarchy JSONB;
BEGIN
  FOR rec IN
    SELECT se.trip_id, se.parsed_data
    FROM public.source_emails se
    WHERE se.trip_id IS NOT NULL
      AND se.status = 'linked'
      AND se.parsed_data IS NOT NULL
      AND se.parsed_data->'sites_hierarchy' IS NOT NULL
  LOOP
    hierarchy := rec.parsed_data->'sites_hierarchy';
    IF jsonb_typeof(hierarchy) = 'array' AND jsonb_array_length(hierarchy) > 0 THEN
      PERFORM public._migrate_sync_hierarchy(rec.trip_id, hierarchy);
    END IF;
  END LOOP;
END $$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS public._migrate_sync_hierarchy(UUID, JSONB, UUID);
