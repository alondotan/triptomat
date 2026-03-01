import { Contact } from '@/types/trip';
import { supabase } from './helpers';

export async function fetchContacts(tripId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapContact);
}

export async function createContact(c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .insert([{
      trip_id: c.tripId,
      name: c.name,
      role: c.role,
      phone: c.phone || null,
      email: c.email || null,
      website: c.website || null,
      notes: c.notes || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return mapContact(data);
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.website !== undefined) updateData.website = updates.website;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  const { error } = await supabase.from('contacts').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    role: (row.role as Contact['role']) || 'other',
    phone: (row.phone as string) || undefined,
    email: (row.email as string) || undefined,
    website: (row.website as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
