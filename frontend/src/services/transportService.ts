import type { Json } from '@/integrations/supabase/types';
import {
  Transportation, SourceRefs, TransportCost, TransportBooking, TransportSegment,
} from '@/types/trip';
import {
  supabase, mergeWithNewWins, mergeSourceRefs, TRANSPORT_STATUS_PRIORITY,
} from './helpers';

export async function fetchTransportation(tripId: string): Promise<Transportation[]> {
  const { data, error } = await supabase
    .from('transportation')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapTransportation);
}

export async function createTransportation(t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transportation> {
  const insertData = {
    trip_id: t.tripId,
    category: t.category,
    status: t.status,
    source_refs: t.sourceRefs as unknown as Json,
    cost: t.cost as unknown as Json,
    booking: t.booking as unknown as Json,
    segments: t.segments as unknown as Json,
    additional_info: t.additionalInfo as unknown as Json,
    is_cancelled: t.isCancelled || false,
    is_paid: t.isPaid ?? false,
  };
  const { data, error } = await supabase
    .from('transportation')
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return mapTransportation(data);
}

export async function updateTransportation(id: string, updates: Partial<Transportation>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.sourceRefs !== undefined) updateData.source_refs = updates.sourceRefs;
  if (updates.cost !== undefined) updateData.cost = updates.cost;
  if (updates.booking !== undefined) updateData.booking = updates.booking;
  if (updates.segments !== undefined) updateData.segments = updates.segments;
  if (updates.additionalInfo !== undefined) updateData.additional_info = updates.additionalInfo;
  if (updates.isCancelled !== undefined) updateData.is_cancelled = updates.isCancelled;
  if (updates.isPaid !== undefined) updateData.is_paid = updates.isPaid;

  const { error } = await supabase.from('transportation').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteTransportation(id: string): Promise<void> {
  const { error } = await supabase.from('transportation').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Merge two Transportation items. Primary survives; secondary fills gaps then is deleted.
 */
export async function mergeTwoTransportations(
  primary: Transportation,
  secondary: Transportation,
): Promise<Transportation> {
  const mergedBooking = mergeWithNewWins(secondary.booking, primary.booking) as TransportBooking;
  const mergedAdditionalInfo = mergeWithNewWins(
    secondary.additionalInfo, primary.additionalInfo,
  ) as Transportation['additionalInfo'];

  const updates: Partial<Transportation> = {
    booking: mergedBooking,
    additionalInfo: mergedAdditionalInfo,
    sourceRefs: mergeSourceRefs(primary.sourceRefs, secondary.sourceRefs),
  };

  // Cost: take primary's unless zero, then take secondary's
  if ((!primary.cost.total_amount || primary.cost.total_amount === 0) && secondary.cost.total_amount > 0) {
    updates.cost = secondary.cost;
  }

  // Segments: keep primary's if non-empty, otherwise take secondary's
  if (primary.segments.length === 0 && secondary.segments.length > 0) {
    updates.segments = secondary.segments;
  }

  // Status: never downgrade
  const secPriority = TRANSPORT_STATUS_PRIORITY[secondary.status] ?? 0;
  const priPriority = TRANSPORT_STATUS_PRIORITY[primary.status] ?? 0;
  if (secPriority > priPriority) updates.status = secondary.status;

  // isPaid: additive
  if (secondary.isPaid) updates.isPaid = true;

  // isCancelled: un-cancel if either is not cancelled
  if (primary.isCancelled && !secondary.isCancelled) updates.isCancelled = false;

  await updateTransportation(primary.id, updates);
  await deleteTransportation(secondary.id);

  return { ...primary, ...updates };
}

export function mapTransportation(row: Record<string, unknown>): Transportation {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    category: row.category as string,
    status: (row.status as Transportation['status']) || 'candidate',
    sourceRefs: (row.source_refs as SourceRefs) || { email_ids: [], recommendation_ids: [] },
    cost: (row.cost as TransportCost) || { total_amount: 0, currency: 'USD' },
    booking: (row.booking as TransportBooking) || {},
    segments: (row.segments as TransportSegment[]) || [],
    additionalInfo: (row.additional_info as Transportation['additionalInfo']) || {},
    isCancelled: (row.is_cancelled as boolean) || false,
    isPaid: (row.is_paid as boolean) || false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
