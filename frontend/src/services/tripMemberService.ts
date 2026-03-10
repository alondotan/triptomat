import { supabase } from '@/integrations/supabase/client';

// Cast to any until trip_members is added to auto-generated types
const db = supabase as any;

export interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  role: 'owner' | 'editor';
  email?: string;
  createdAt: string;
}

export async function fetchTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await db
    .from('trip_members')
    .select('id, trip_id, user_id, role, created_at')
    .eq('trip_id', tripId);

  if (error) throw error;

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;
  const currentEmail = user?.email;

  return (data || []).map((row: any) => ({
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    role: row.role as 'owner' | 'editor',
    email: row.user_id === currentUserId ? currentEmail : undefined,
    createdAt: row.created_at,
  }));
}

export async function addTripMember(tripId: string, email: string): Promise<TripMember> {
  const { data: userData, error: lookupError } = await supabase
    .rpc('get_user_id_by_email' as any, { lookup_email: email });

  if (lookupError || !userData) {
    throw new Error('User not found. They need to sign up first.');
  }

  const userId = userData as string;

  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await db
    .from('trip_members')
    .insert({
      trip_id: tripId,
      user_id: userId,
      role: 'editor',
      invited_by: user?.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('User is already a member of this trip.');
    throw error;
  }

  return {
    id: data.id,
    tripId: data.trip_id,
    userId: data.user_id,
    role: data.role as 'owner' | 'editor',
    email,
    createdAt: data.created_at,
  };
}

export async function removeTripMember(memberId: string): Promise<void> {
  const { error } = await db
    .from('trip_members')
    .delete()
    .eq('id', memberId);

  if (error) throw error;
}

/** Get the current user's role for a specific trip */
export async function getMyTripRole(tripId: string): Promise<'owner' | 'editor' | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await db
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return null;
  return data.role as 'owner' | 'editor';
}
