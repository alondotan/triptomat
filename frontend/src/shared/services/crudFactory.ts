import { supabase } from './helpers';

export interface CrudConfig<TEntity> {
  table: string;
  /** Optional Postgres select expression for joins. Defaults to '*'.
   *  Example: 'id, name, members:trip_members(role, user_id)' */
  select?: string;
  orderBy?: { column: string; ascending: boolean };
  mapRow: (row: Record<string, unknown>) => TEntity;
  toInsertRow: (item: Omit<TEntity, 'id' | 'createdAt' | 'updatedAt'>) => Record<string, unknown>;
  toUpdateRow: (updates: Partial<TEntity>) => Record<string, unknown>;
}

export interface CrudService<TEntity> {
  fetch: (tripId: string) => Promise<TEntity[]>;
  fetchOne: (id: string) => Promise<TEntity | null>;
  create: (item: Omit<TEntity, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TEntity>;
  update: (id: string, updates: Partial<TEntity>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function createCrudService<TEntity>(config: CrudConfig<TEntity>): CrudService<TEntity> {
  const { table, select = '*', orderBy, mapRow, toInsertRow, toUpdateRow } = config;

  return {
    async fetch(tripId: string): Promise<TEntity[]> {
      let query = supabase.from(table).select(select).eq('trip_id', tripId);
      if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending });
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(row => mapRow(row as Record<string, unknown>));
    },

    async fetchOne(id: string): Promise<TEntity | null> {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async create(item): Promise<TEntity> {
      const { data, error } = await supabase
        .from(table)
        .insert([toInsertRow(item)])
        .select(select)
        .single();
      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },

    async update(id: string, updates: Partial<TEntity>): Promise<void> {
      const updateData = toUpdateRow(updates);
      if (Object.keys(updateData).length === 0) return;
      const { error } = await supabase.from(table).update(updateData).eq('id', id);
      if (error) throw error;
    },

    async remove(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
  };
}
