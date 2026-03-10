-- Backfill trip_locations from source_recommendations that were synced
-- via sync-maps-list (which didn't have the trip_locations sync before).

CREATE OR REPLACE FUNCTION public._backfill_sync_hierarchy(
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
    SELECT id INTO existing_id
    FROM public.trip_locations
    WHERE trip_id = p_trip_id AND LOWER(name) = LOWER(node->>'site')
    LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.trip_locations (trip_id, parent_id, name, site_type, sort_order, source)
      VALUES (p_trip_id, p_parent_id, node->>'site', node->>'site_type', 0, 'webhook')
      ON CONFLICT DO NOTHING
      RETURNING id INTO new_id;

      IF new_id IS NOT NULL AND node->'sub_sites' IS NOT NULL AND jsonb_typeof(node->'sub_sites') = 'array' THEN
        PERFORM public._backfill_sync_hierarchy(p_trip_id, node->'sub_sites', new_id);
      END IF;
    ELSE
      IF node->'sub_sites' IS NOT NULL AND jsonb_typeof(node->'sub_sites') = 'array' THEN
        PERFORM public._backfill_sync_hierarchy(p_trip_id, node->'sub_sites', existing_id);
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
      PERFORM public._backfill_sync_hierarchy(rec.trip_id, hierarchy);
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
      PERFORM public._backfill_sync_hierarchy(rec.trip_id, hierarchy);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public._backfill_sync_hierarchy(UUID, JSONB, UUID);
