-- Allow nullable dates for research/planning modes
ALTER TABLE trips ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN end_date DROP NOT NULL;

-- Add number_of_days for planning mode
ALTER TABLE trips ADD COLUMN IF NOT EXISTS number_of_days integer;
