
-- Enable pgcrypto for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add user_id to trips
ALTER TABLE public.trips ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create webhook_tokens table for user identification in webhooks
CREATE TABLE public.webhook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own token" ON public.webhook_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own token" ON public.webhook_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create webhook token on user signup
CREATE OR REPLACE FUNCTION public.create_webhook_token_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webhook_tokens (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_webhook_token
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_webhook_token_for_user();

-- Now fix RLS on ALL tables to be user-scoped via trips.user_id

-- Helper function to check trip ownership
CREATE OR REPLACE FUNCTION public.owns_trip(_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips WHERE id = _trip_id AND user_id = auth.uid()
  )
$$;

-- TRIPS: drop old permissive policies, add user-scoped ones
DROP POLICY IF EXISTS "Allow public read on trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public insert on trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public update on trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public delete on trips" ON public.trips;

CREATE POLICY "Users can view own trips" ON public.trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON public.trips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id);

-- POINTS_OF_INTEREST
DROP POLICY IF EXISTS "Allow public read on poi" ON public.points_of_interest;
DROP POLICY IF EXISTS "Allow public insert on poi" ON public.points_of_interest;
DROP POLICY IF EXISTS "Allow public update on poi" ON public.points_of_interest;
DROP POLICY IF EXISTS "Allow public delete on poi" ON public.points_of_interest;

CREATE POLICY "Users can view own POIs" ON public.points_of_interest FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create POIs" ON public.points_of_interest FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own POIs" ON public.points_of_interest FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own POIs" ON public.points_of_interest FOR DELETE USING (public.owns_trip(trip_id));

-- TRANSPORTATION
DROP POLICY IF EXISTS "Allow public read on transportation" ON public.transportation;
DROP POLICY IF EXISTS "Allow public insert on transportation" ON public.transportation;
DROP POLICY IF EXISTS "Allow public update on transportation" ON public.transportation;
DROP POLICY IF EXISTS "Allow public delete on transportation" ON public.transportation;

CREATE POLICY "Users can view own transportation" ON public.transportation FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create transportation" ON public.transportation FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own transportation" ON public.transportation FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own transportation" ON public.transportation FOR DELETE USING (public.owns_trip(trip_id));

-- ITINERARY_DAYS
DROP POLICY IF EXISTS "Allow public read on itinerary_days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Allow public insert on itinerary_days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Allow public update on itinerary_days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Allow public delete on itinerary_days" ON public.itinerary_days;

CREATE POLICY "Users can view own itinerary_days" ON public.itinerary_days FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create itinerary_days" ON public.itinerary_days FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own itinerary_days" ON public.itinerary_days FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own itinerary_days" ON public.itinerary_days FOR DELETE USING (public.owns_trip(trip_id));

-- MISSIONS
DROP POLICY IF EXISTS "Allow public read on missions" ON public.missions;
DROP POLICY IF EXISTS "Allow public insert on missions" ON public.missions;
DROP POLICY IF EXISTS "Allow public update on missions" ON public.missions;
DROP POLICY IF EXISTS "Allow public delete on missions" ON public.missions;

CREATE POLICY "Users can view own missions" ON public.missions FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create missions" ON public.missions FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own missions" ON public.missions FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own missions" ON public.missions FOR DELETE USING (public.owns_trip(trip_id));

-- COLLECTIONS
DROP POLICY IF EXISTS "Allow public read on collections" ON public.collections;
DROP POLICY IF EXISTS "Allow public insert on collections" ON public.collections;
DROP POLICY IF EXISTS "Allow public update on collections" ON public.collections;
DROP POLICY IF EXISTS "Allow public delete on collections" ON public.collections;

CREATE POLICY "Users can view own collections" ON public.collections FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create collections" ON public.collections FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own collections" ON public.collections FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own collections" ON public.collections FOR DELETE USING (public.owns_trip(trip_id));

-- SOURCE_EMAILS
DROP POLICY IF EXISTS "Allow public read on source_emails" ON public.source_emails;
DROP POLICY IF EXISTS "Allow public insert on source_emails" ON public.source_emails;
DROP POLICY IF EXISTS "Allow public update on source_emails" ON public.source_emails;
DROP POLICY IF EXISTS "Allow public delete on source_emails" ON public.source_emails;

CREATE POLICY "Users can view own source_emails" ON public.source_emails FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create source_emails" ON public.source_emails FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own source_emails" ON public.source_emails FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own source_emails" ON public.source_emails FOR DELETE USING (public.owns_trip(trip_id));

-- SOURCE_RECOMMENDATIONS
DROP POLICY IF EXISTS "Allow public read on source_recommendations" ON public.source_recommendations;
DROP POLICY IF EXISTS "Allow public insert on source_recommendations" ON public.source_recommendations;
DROP POLICY IF EXISTS "Allow public update on source_recommendations" ON public.source_recommendations;
DROP POLICY IF EXISTS "Allow public delete on source_recommendations" ON public.source_recommendations;

CREATE POLICY "Users can view own source_recommendations" ON public.source_recommendations FOR SELECT USING (public.owns_trip(trip_id));
CREATE POLICY "Users can create source_recommendations" ON public.source_recommendations FOR INSERT WITH CHECK (public.owns_trip(trip_id));
CREATE POLICY "Users can update own source_recommendations" ON public.source_recommendations FOR UPDATE USING (public.owns_trip(trip_id));
CREATE POLICY "Users can delete own source_recommendations" ON public.source_recommendations FOR DELETE USING (public.owns_trip(trip_id));
