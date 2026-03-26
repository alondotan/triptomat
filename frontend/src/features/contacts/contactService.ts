import { Contact } from '@/types/trip';
import { createCrudService } from '@/shared/services/crudFactory';

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    role: (row.role as Contact['role']) || 'other',
    phone: (row.phone as string) || undefined,
    email: (row.email as string) || undefined,
    website: (row.website as string) || undefined,
    address: (row.address as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const crud = createCrudService<Contact>({
  table: 'contacts',
  orderBy: { column: 'created_at', ascending: true },
  mapRow: mapContact,
  toInsertRow: (c) => ({
    trip_id: c.tripId,
    name: c.name,
    role: c.role,
    phone: c.phone || null,
    email: c.email || null,
    website: c.website || null,
    address: c.address || null,
    notes: c.notes || null,
  }),
  toUpdateRow: (updates) => {
    const d: Record<string, unknown> = {};
    if (updates.name !== undefined) d.name = updates.name;
    if (updates.role !== undefined) d.role = updates.role;
    if (updates.phone !== undefined) d.phone = updates.phone;
    if (updates.email !== undefined) d.email = updates.email;
    if (updates.website !== undefined) d.website = updates.website;
    if (updates.address !== undefined) d.address = updates.address;
    if (updates.notes !== undefined) d.notes = updates.notes;
    return d;
  },
});

export const fetchContacts = crud.fetch;
export const createContact = crud.create;
export const updateContact = crud.update;
export const deleteContact = crud.remove;
