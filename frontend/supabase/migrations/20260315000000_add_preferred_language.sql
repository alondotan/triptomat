-- Add preferred language column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.preferred_language IS 'User preferred UI language (he/en)';
