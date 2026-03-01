import type { Json } from '@/integrations/supabase/types';
import { Mission } from '@/types/trip';
import { supabase } from './helpers';

export async function fetchMissions(tripId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapMission);
}

export async function createMission(m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>): Promise<Mission> {
  const insertData = {
    trip_id: m.tripId,
    title: m.title,
    description: m.description,
    status: m.status,
    due_date: m.dueDate,
    context_links: m.contextLinks,
    reminders: m.reminders as unknown as Json,
    object_link: m.objectLink,
  };
  const { data, error } = await supabase
    .from('missions')
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return mapMission(data);
}

export async function updateMission(id: string, updates: Partial<Mission>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate;
  if (updates.contextLinks !== undefined) updateData.context_links = updates.contextLinks;
  if (updates.reminders !== undefined) updateData.reminders = updates.reminders;
  if (updates.objectLink !== undefined) updateData.object_link = updates.objectLink;

  const { error } = await supabase.from('missions').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('missions').delete().eq('id', id);
  if (error) throw error;
}

function mapMission(row: Record<string, unknown>): Mission {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    status: (row.status as Mission['status']) || 'pending',
    dueDate: (row.due_date as string) || undefined,
    contextLinks: (row.context_links as string[]) || [],
    reminders: (row.reminders as Mission['reminders']) || [],
    objectLink: (row.object_link as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
