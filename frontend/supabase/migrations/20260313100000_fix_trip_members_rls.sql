-- ============================================================
-- Fix trip_members RLS infinite recursion + trips INSERT timing
-- ============================================================
-- Problem 1: trip_members SELECT policy self-references → infinite recursion → 500
-- Problem 2: trips INSERT+RETURNING runs before AFTER INSERT trigger creates
--            the owner row in trip_members, so has_trip_access() fails → 403
-- ============================================================

-- 1. Helper function: returns all trip_ids the current user belongs to.
--    SECURITY DEFINER bypasses RLS, breaking the recursion.
CREATE OR REPLACE FUNCTION public.user_trip_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
$$;

-- 2. Fix trip_members SELECT policy (replace self-referencing policy)
DROP POLICY IF EXISTS "Members can view trip members" ON public.trip_members;
CREATE POLICY "Members can view trip members" ON public.trip_members
  FOR SELECT USING (trip_id IN (SELECT public.user_trip_ids()));

-- 3. Fix trip_members INSERT policy (also had self-reference for owner check)
DROP POLICY IF EXISTS "Owner can add members" ON public.trip_members;
CREATE POLICY "Owner can add members" ON public.trip_members
  FOR INSERT WITH CHECK (
    -- Owner adding another member
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = trip_members.trip_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
    OR
    -- Self-insert as owner (from trigger or initial creation)
    (role = 'owner' AND user_id = auth.uid())
  );

-- 4. Fix trip_members DELETE policy (also had self-reference)
DROP POLICY IF EXISTS "Owner can remove members" ON public.trip_members;
CREATE POLICY "Owner can remove members" ON public.trip_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = trip_members.trip_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

-- 5. Fix trips SELECT policy: also allow creator to see own trips
--    (covers the INSERT+RETURNING timing gap before trigger fires)
DROP POLICY IF EXISTS "Members can view trips" ON public.trips;
CREATE POLICY "Members can view trips" ON public.trips
  FOR SELECT USING (
    public.has_trip_access(id) OR auth.uid() = user_id
  );
