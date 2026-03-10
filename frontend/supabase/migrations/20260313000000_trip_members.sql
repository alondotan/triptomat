-- ============================================================
-- Multi-user trip sharing via trip_members table
-- ============================================================
-- Replaces the single-owner model (trips.user_id) with a members
-- table that supports owner + editor roles. The download cache
-- (DynamoDB) remains shared and unchanged.
-- ============================================================

-- 1. Create trip_members table
CREATE TABLE public.trip_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',  -- 'owner' | 'editor'
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trip_id, user_id)
);

CREATE INDEX idx_trip_members_user_id ON public.trip_members(user_id);
CREATE INDEX idx_trip_members_trip_id ON public.trip_members(trip_id);

ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of trips they belong to
CREATE POLICY "Members can view trip members" ON public.trip_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = trip_members.trip_id AND tm.user_id = auth.uid())
  );

-- Only trip owner can add members
CREATE POLICY "Owner can add members" ON public.trip_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = trip_members.trip_id AND tm.user_id = auth.uid() AND tm.role = 'owner')
    OR
    -- Allow the auto-insert trigger (owner row) when creating a trip
    (role = 'owner' AND user_id = auth.uid())
  );

-- Only trip owner can remove members
CREATE POLICY "Owner can remove members" ON public.trip_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = trip_members.trip_id AND tm.user_id = auth.uid() AND tm.role = 'owner')
  );

-- 2. Backfill: create owner rows for all existing trips
INSERT INTO public.trip_members (trip_id, user_id, role)
SELECT id, user_id, 'owner' FROM public.trips
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Auto-insert owner row when a new trip is created
CREATE OR REPLACE FUNCTION public.create_trip_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_trip_created_add_owner
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.create_trip_owner_member();

-- 4. Replace owns_trip() with has_trip_access() (member check)
CREATE OR REPLACE FUNCTION public.has_trip_access(_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = _trip_id AND user_id = auth.uid()
  )
$$;

-- Helper: check if user is trip owner
CREATE OR REPLACE FUNCTION public.is_trip_owner(_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = _trip_id AND user_id = auth.uid() AND role = 'owner'
  )
$$;

-- 5. Update TRIPS RLS policies
DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can create trips" ON public.trips;
DROP POLICY IF EXISTS "Users can update own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can delete own trips" ON public.trips;

CREATE POLICY "Members can view trips" ON public.trips
  FOR SELECT USING (public.has_trip_access(id));
CREATE POLICY "Users can create trips" ON public.trips
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members can update trips" ON public.trips
  FOR UPDATE USING (public.has_trip_access(id));
CREATE POLICY "Owner can delete trips" ON public.trips
  FOR DELETE USING (public.is_trip_owner(id));

-- 6. Update POINTS_OF_INTEREST RLS policies
DROP POLICY IF EXISTS "Users can view own POIs" ON public.points_of_interest;
DROP POLICY IF EXISTS "Users can create POIs" ON public.points_of_interest;
DROP POLICY IF EXISTS "Users can update own POIs" ON public.points_of_interest;
DROP POLICY IF EXISTS "Users can delete own POIs" ON public.points_of_interest;

CREATE POLICY "Members can view POIs" ON public.points_of_interest
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create POIs" ON public.points_of_interest
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update POIs" ON public.points_of_interest
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete POIs" ON public.points_of_interest
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 7. Update TRANSPORTATION RLS policies
DROP POLICY IF EXISTS "Users can view own transportation" ON public.transportation;
DROP POLICY IF EXISTS "Users can create transportation" ON public.transportation;
DROP POLICY IF EXISTS "Users can update own transportation" ON public.transportation;
DROP POLICY IF EXISTS "Users can delete own transportation" ON public.transportation;

CREATE POLICY "Members can view transportation" ON public.transportation
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create transportation" ON public.transportation
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update transportation" ON public.transportation
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete transportation" ON public.transportation
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 8. Update ITINERARY_DAYS RLS policies
DROP POLICY IF EXISTS "Users can view own itinerary_days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Users can create itinerary_days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Users can update own itinerary_days" ON public.itinerary_days;
DROP POLICY IF EXISTS "Users can delete own itinerary_days" ON public.itinerary_days;

CREATE POLICY "Members can view itinerary_days" ON public.itinerary_days
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create itinerary_days" ON public.itinerary_days
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update itinerary_days" ON public.itinerary_days
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete itinerary_days" ON public.itinerary_days
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 9. Update MISSIONS RLS policies
DROP POLICY IF EXISTS "Users can view own missions" ON public.missions;
DROP POLICY IF EXISTS "Users can create missions" ON public.missions;
DROP POLICY IF EXISTS "Users can update own missions" ON public.missions;
DROP POLICY IF EXISTS "Users can delete own missions" ON public.missions;

CREATE POLICY "Members can view missions" ON public.missions
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create missions" ON public.missions
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update missions" ON public.missions
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete missions" ON public.missions
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 10. Update COLLECTIONS RLS policies
DROP POLICY IF EXISTS "Users can view own collections" ON public.collections;
DROP POLICY IF EXISTS "Users can create collections" ON public.collections;
DROP POLICY IF EXISTS "Users can update own collections" ON public.collections;
DROP POLICY IF EXISTS "Users can delete own collections" ON public.collections;

CREATE POLICY "Members can view collections" ON public.collections
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create collections" ON public.collections
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update collections" ON public.collections
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete collections" ON public.collections
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 11. Update SOURCE_EMAILS RLS policies
DROP POLICY IF EXISTS "Users can view own source_emails" ON public.source_emails;
DROP POLICY IF EXISTS "Users can create source_emails" ON public.source_emails;
DROP POLICY IF EXISTS "Users can update own source_emails" ON public.source_emails;
DROP POLICY IF EXISTS "Users can delete own source_emails" ON public.source_emails;

CREATE POLICY "Members can view source_emails" ON public.source_emails
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create source_emails" ON public.source_emails
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update source_emails" ON public.source_emails
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete source_emails" ON public.source_emails
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 12. Update SOURCE_RECOMMENDATIONS RLS policies
DROP POLICY IF EXISTS "Users can view own source_recommendations" ON public.source_recommendations;
DROP POLICY IF EXISTS "Users can create source_recommendations" ON public.source_recommendations;
DROP POLICY IF EXISTS "Users can update own source_recommendations" ON public.source_recommendations;
DROP POLICY IF EXISTS "Users can delete own source_recommendations" ON public.source_recommendations;

CREATE POLICY "Members can view source_recommendations" ON public.source_recommendations
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create source_recommendations" ON public.source_recommendations
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update source_recommendations" ON public.source_recommendations
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete source_recommendations" ON public.source_recommendations
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 13. Update EXPENSES RLS policies
DROP POLICY IF EXISTS "Users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON public.expenses;

CREATE POLICY "Members can view expenses" ON public.expenses
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create expenses" ON public.expenses
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update expenses" ON public.expenses
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete expenses" ON public.expenses
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 14. Update CONTACTS RLS policies
DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can create contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can update own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;

CREATE POLICY "Members can view contacts" ON public.contacts
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create contacts" ON public.contacts
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update contacts" ON public.contacts
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete contacts" ON public.contacts
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 15. Update TRIP_LOCATIONS RLS policies
DROP POLICY IF EXISTS "Users can view own trip locations" ON public.trip_locations;
DROP POLICY IF EXISTS "Users can create trip locations" ON public.trip_locations;
DROP POLICY IF EXISTS "Users can update own trip locations" ON public.trip_locations;
DROP POLICY IF EXISTS "Users can delete own trip locations" ON public.trip_locations;

CREATE POLICY "Members can view trip locations" ON public.trip_locations
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create trip locations" ON public.trip_locations
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update trip locations" ON public.trip_locations
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete trip locations" ON public.trip_locations
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 16. Update MAP_LISTS RLS policies (switch from user_id to trip membership)
DROP POLICY IF EXISTS "Users manage own map_lists" ON public.map_lists;

CREATE POLICY "Members can view map lists" ON public.map_lists
  FOR SELECT USING (public.has_trip_access(trip_id));
CREATE POLICY "Members can create map lists" ON public.map_lists
  FOR INSERT WITH CHECK (public.has_trip_access(trip_id));
CREATE POLICY "Members can update map lists" ON public.map_lists
  FOR UPDATE USING (public.has_trip_access(trip_id));
CREATE POLICY "Owner can delete map lists" ON public.map_lists
  FOR DELETE USING (public.is_trip_owner(trip_id));

-- 17. Update MAP_LIST_ITEMS RLS policies
DROP POLICY IF EXISTS "Users view own list items" ON public.map_list_items;

CREATE POLICY "Members can view map list items" ON public.map_list_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.map_lists ml WHERE ml.id = list_id AND public.has_trip_access(ml.trip_id))
  );
CREATE POLICY "Members can create map list items" ON public.map_list_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.map_lists ml WHERE ml.id = list_id AND public.has_trip_access(ml.trip_id))
  );
CREATE POLICY "Members can update map list items" ON public.map_list_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.map_lists ml WHERE ml.id = list_id AND public.has_trip_access(ml.trip_id))
  );
CREATE POLICY "Owner can delete map list items" ON public.map_list_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.map_lists ml WHERE ml.id = list_id AND public.is_trip_owner(ml.trip_id))
  );

-- 18. RPC function: look up user_id by email (for share-by-email flow)
-- SECURITY DEFINER so that regular users can resolve an email to a user_id
-- without having direct access to auth.users
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lower(lookup_email) LIMIT 1
$$;
