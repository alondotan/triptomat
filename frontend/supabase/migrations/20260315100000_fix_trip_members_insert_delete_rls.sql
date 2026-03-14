-- ============================================================
-- Fix trip_members INSERT and DELETE policies: infinite recursion
-- ============================================================
-- The INSERT and DELETE policies still use self-referencing
-- EXISTS (SELECT FROM trip_members), causing infinite recursion.
-- Replace with the SECURITY DEFINER helper is_trip_owner()
-- which bypasses RLS and breaks the cycle.
-- ============================================================

-- 1. Fix INSERT policy: use is_trip_owner() instead of self-referencing EXISTS
DROP POLICY IF EXISTS "Owner can add members" ON public.trip_members;
CREATE POLICY "Owner can add members" ON public.trip_members
  FOR INSERT WITH CHECK (
    -- Owner adding another member
    public.is_trip_owner(trip_id)
    OR
    -- Self-insert as owner (from trigger or initial creation)
    (role = 'owner' AND user_id = auth.uid())
  );

-- 2. Fix DELETE policy: same approach
DROP POLICY IF EXISTS "Owner can remove members" ON public.trip_members;
CREATE POLICY "Owner can remove members" ON public.trip_members
  FOR DELETE USING (
    public.is_trip_owner(trip_id)
  );
