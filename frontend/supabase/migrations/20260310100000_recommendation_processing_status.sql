-- Add 'processing' and 'failed' status values + error column for progressive loading UX
ALTER TABLE source_recommendations
  DROP CONSTRAINT IF EXISTS source_recommendations_status_check;

ALTER TABLE source_recommendations
  ADD CONSTRAINT source_recommendations_status_check
  CHECK (status IN ('pending', 'linked', 'cancelled', 'processing', 'failed'));

ALTER TABLE source_recommendations
  ADD COLUMN IF NOT EXISTS error text;
