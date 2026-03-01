import { Expense } from '@/types/trip';
import { supabase } from './helpers';

export async function fetchExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapExpense);
}

export async function createExpense(e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .insert([{
      trip_id: e.tripId,
      description: e.description,
      category: e.category,
      amount: e.amount,
      currency: e.currency,
      date: e.date || null,
      notes: e.notes || null,
      is_paid: e.isPaid ?? false,
    }])
    .select()
    .single();
  if (error) throw error;
  return mapExpense(data);
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.currency !== undefined) updateData.currency = updates.currency;
  if (updates.date !== undefined) updateData.date = updates.date;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.isPaid !== undefined) updateData.is_paid = updates.isPaid;
  const { error } = await supabase.from('expenses').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

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
