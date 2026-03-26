import { Expense } from '@/types/trip';
import { createCrudService } from '@/shared/services/crudFactory';

function mapExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    description: row.description as string,
    category: row.category as string,
    amount: Number(row.amount) || 0,
    currency: row.currency as string,
    date: (row.date as string) || undefined,
    notes: (row.notes as string) || undefined,
    isPaid: (row.is_paid as boolean) || false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const crud = createCrudService<Expense>({
  table: 'expenses',
  orderBy: { column: 'created_at', ascending: false },
  mapRow: mapExpense,
  toInsertRow: (e) => ({
    trip_id: e.tripId,
    description: e.description,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    date: e.date || null,
    notes: e.notes || null,
    is_paid: e.isPaid ?? false,
  }),
  toUpdateRow: (updates) => {
    const d: Record<string, unknown> = {};
    if (updates.description !== undefined) d.description = updates.description;
    if (updates.category !== undefined) d.category = updates.category;
    if (updates.amount !== undefined) d.amount = updates.amount;
    if (updates.currency !== undefined) d.currency = updates.currency;
    if (updates.date !== undefined) d.date = updates.date;
    if (updates.notes !== undefined) d.notes = updates.notes;
    if (updates.isPaid !== undefined) d.is_paid = updates.isPaid;
    return d;
  },
});

export const fetchExpenses = crud.fetch;
export const createExpense = crud.create;
export const updateExpense = crud.update;
export const deleteExpense = crud.remove;
