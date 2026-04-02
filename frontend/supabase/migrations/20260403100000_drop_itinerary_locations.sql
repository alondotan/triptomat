-- Phase 2 cleanup: drop itinerary_locations after code is fully migrated to trip_location_id.
-- Run this migration ONLY after deploying the code changes that remove all references to
-- itinerary_location_id and itinerary_locations.

ALTER TABLE public.itinerary_days DROP COLUMN IF EXISTS itinerary_location_id;
ALTER TABLE public.itinerary_days DROP COLUMN IF EXISTS location_context;

DROP TABLE IF EXISTS public.itinerary_locations;
