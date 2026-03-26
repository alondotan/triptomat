import type { Json } from '@/integrations/supabase/types';
import { Mission } from '@/types/trip';
import { createCrudService } from '@/shared/services/crudFactory';

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

const crud = createCrudService<Mission>({
  table: 'missions',
  orderBy: { column: 'created_at', ascending: true },
  mapRow: mapMission,
  toInsertRow: (m) => ({
    trip_id: m.tripId,
    title: m.title,
    description: m.description,
    status: m.status,
    due_date: m.dueDate,
    context_links: m.contextLinks,
    reminders: m.reminders as unknown as Json,
    object_link: m.objectLink,
  }),
  toUpdateRow: (updates) => {
    const d: Record<string, unknown> = {};
    if (updates.title !== undefined) d.title = updates.title;
    if (updates.description !== undefined) d.description = updates.description;
    if (updates.status !== undefined) d.status = updates.status;
    if (updates.dueDate !== undefined) d.due_date = updates.dueDate;
    if (updates.contextLinks !== undefined) d.context_links = updates.contextLinks;
    if (updates.reminders !== undefined) d.reminders = updates.reminders;
    if (updates.objectLink !== undefined) d.object_link = updates.objectLink;
    return d;
  },
});

export const fetchMissions = crud.fetch;
export const createMission = crud.create;
export const updateMission = crud.update;
export const deleteMission = crud.remove;
