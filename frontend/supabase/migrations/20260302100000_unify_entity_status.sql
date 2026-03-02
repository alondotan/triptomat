-- Unify entity status values across all tables
-- Old POI:       candidate | in_plan | matched | booked | visited
-- Old Transport:  candidate | in_plan | booked  | completed
-- Old Collection: candidate | in_plan | booked
-- New (all):      suggested | interested | planned | scheduled | booked | visited | skipped

-- ── Points of Interest ──────────────────────────────────────────────────────
UPDATE public.points_of_interest SET status = 'suggested'   WHERE status = 'candidate';
UPDATE public.points_of_interest SET status = 'interested'  WHERE status = 'in_plan';
UPDATE public.points_of_interest SET status = 'planned'     WHERE status = 'matched';

-- Upgrade planned → scheduled for POIs that have at least one booking with a time
UPDATE public.points_of_interest SET status = 'scheduled'
WHERE status = 'planned'
  AND details->'bookings' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(details->'bookings') b
    WHERE b->>'reservation_hour' IS NOT NULL AND b->>'reservation_hour' != ''
  );

-- Remove schedule_state from bookings JSONB (absorbed into POI status)
UPDATE public.points_of_interest
SET details = jsonb_set(
  details,
  '{bookings}',
  (SELECT jsonb_agg(b - 'schedule_state') FROM jsonb_array_elements(details->'bookings') b)
)
WHERE details->'bookings' IS NOT NULL
  AND jsonb_array_length(details->'bookings') > 0;

-- ── Transportation ──────────────────────────────────────────────────────────
UPDATE public.transportation SET status = 'suggested'   WHERE status = 'candidate';
UPDATE public.transportation SET status = 'interested'  WHERE status = 'in_plan';
UPDATE public.transportation SET status = 'visited'     WHERE status = 'completed';

-- ── Collections ─────────────────────────────────────────────────────────────
UPDATE public.collections SET status = 'suggested'   WHERE status = 'candidate';
UPDATE public.collections SET status = 'interested'  WHERE status = 'in_plan';
