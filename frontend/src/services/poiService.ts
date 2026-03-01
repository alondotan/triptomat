import type { Json } from '@/integrations/supabase/types';
import {
  PointOfInterest, POILocation, SourceRefs, POIDetails, POIBooking,
} from '@/types/trip';
import {
  supabase, hasValue, mergeWithNewWins, fuzzyMatch,
  mergeSourceRefs, STATUS_PRIORITY,
} from './helpers';

export async function fetchPOIs(tripId: string): Promise<PointOfInterest[]> {
  const { data, error } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapPOI);
}

/**
 * Creates a new POI, or merges with an existing one if a POI with the same
 * name + category (+ matching city when both have it) already exists for the trip.
 * Merge rule: new value wins when both have a value; empty/null/undefined preserves the old.
 * Returns the resulting POI and whether a merge occurred.
 */
export async function createOrMergePOI(
  poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ poi: PointOfInterest; merged: boolean }> {
  const { data: candidates } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('trip_id', poi.tripId)
    .eq('category', poi.category);

  const newCity = poi.location?.city;
  const existingRow = (candidates || []).find((p: Record<string, unknown>) => {
    if (!fuzzyMatch(p.name as string, poi.name)) return false;
    const existingCity = (p.location as Record<string, unknown>)?.city as string | undefined;
    if (newCity && existingCity && !fuzzyMatch(existingCity, newCity)) return false;
    return true;
  });

  if (existingRow) {
    const existingPoi = mapPOI(existingRow);
    const mergedLocation = mergeWithNewWins(existingPoi.location, poi.location) as POILocation;
    const mergedDetails = mergeWithNewWins(existingPoi.details, poi.details) as POIDetails;

    // Bookings: concatenate + deduplicate instead of "new wins"
    mergedDetails.bookings = mergeBookings(existingPoi.details.bookings, poi.details.bookings);

    const updates: Partial<PointOfInterest> = {
      location: mergedLocation,
      details: mergedDetails,
    };

    // Keep sub_category if new one is provided
    if (hasValue(poi.subCategory)) updates.subCategory = poi.subCategory;

    // Upgrade status only; never downgrade (e.g. don't overwrite 'booked' with 'candidate')
    const newPriority = STATUS_PRIORITY[poi.status] ?? 0;
    const existingPriority = STATUS_PRIORITY[existingPoi.status] ?? 0;
    if (newPriority > existingPriority) updates.status = poi.status;

    // isPaid is additive: once paid, stays paid
    if (poi.isPaid) updates.isPaid = true;

    await updatePOI(existingPoi.id, updates);
    const merged: PointOfInterest = { ...existingPoi, ...updates };
    return { poi: merged, merged: true };
  }

  const newPoi = await createPOI(poi);
  return { poi: newPoi, merged: false };
}

export async function createPOI(poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>): Promise<PointOfInterest> {
  const insertData = {
    trip_id: poi.tripId,
    category: poi.category,
    sub_category: poi.subCategory,
    name: poi.name,
    status: poi.status,
    location: poi.location as unknown as Json,
    source_refs: poi.sourceRefs as unknown as Json,
    details: poi.details as unknown as Json,
    is_cancelled: poi.isCancelled || false,
    is_paid: poi.isPaid ?? false,
  };
  const { data, error } = await supabase
    .from('points_of_interest')
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return mapPOI(data);
}

export async function updatePOI(poiId: string, updates: Partial<PointOfInterest>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.subCategory !== undefined) updateData.sub_category = updates.subCategory;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.location !== undefined) updateData.location = updates.location;
  if (updates.sourceRefs !== undefined) updateData.source_refs = updates.sourceRefs;
  if (updates.details !== undefined) updateData.details = updates.details;
  if (updates.isCancelled !== undefined) updateData.is_cancelled = updates.isCancelled;
  if (updates.isPaid !== undefined) updateData.is_paid = updates.isPaid;

  const { error } = await supabase.from('points_of_interest').update(updateData).eq('id', poiId);
  if (error) throw error;
}

export async function deletePOI(poiId: string): Promise<void> {
  const { error } = await supabase.from('points_of_interest').delete().eq('id', poiId);
  if (error) throw error;
}

/**
 * Merge two POIs. The primary survives; secondary fills gaps then is deleted.
 * Uses mergeWithNewWins(secondary, primary) so primary's values win.
 */
export async function mergeTwoPOIs(
  primary: PointOfInterest,
  secondary: PointOfInterest,
): Promise<PointOfInterest> {
  const mergedLocation = mergeWithNewWins(secondary.location, primary.location) as POILocation;
  const mergedDetails = mergeWithNewWins(secondary.details, primary.details) as POIDetails;
  // Bookings: concatenate + deduplicate instead of "new wins"
  mergedDetails.bookings = mergeBookings(primary.details.bookings, secondary.details.bookings);

  const updates: Partial<PointOfInterest> = {
    location: mergedLocation,
    details: mergedDetails,
    sourceRefs: mergeSourceRefs(primary.sourceRefs, secondary.sourceRefs),
  };

  if (!hasValue(primary.subCategory) && hasValue(secondary.subCategory)) {
    updates.subCategory = secondary.subCategory;
  }

  // Status: never downgrade
  const secPriority = STATUS_PRIORITY[secondary.status] ?? 0;
  const priPriority = STATUS_PRIORITY[primary.status] ?? 0;
  if (secPriority > priPriority) updates.status = secondary.status;

  // isPaid: additive
  if (secondary.isPaid) updates.isPaid = true;

  // isCancelled: un-cancel if either is not cancelled
  if (primary.isCancelled && !secondary.isCancelled) updates.isCancelled = false;

  await updatePOI(primary.id, updates);
  await deletePOI(secondary.id);

  return { ...primary, ...updates };
}

/** Concatenate two bookings arrays, deduplicating by date+hour. */
function mergeBookings(a?: POIBooking[], b?: POIBooking[]): POIBooking[] | undefined {
  const all = [...(a || []), ...(b || [])];
  if (all.length === 0) return undefined;
  const seen = new Set<string>();
  return all.filter(slot => {
    const key = `${slot.reservation_date || ''}|${slot.reservation_hour || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Convert legacy `booking` (single object) to `bookings` array. */
function normalizeDetails(raw: Record<string, unknown>): POIDetails {
  const details = { ...raw } as POIDetails & { booking?: POIBooking };
  if (details.booking && !details.bookings) {
    details.bookings = [details.booking];
  }
  delete details.booking;
  return details;
}

/**
 * Rebuilds a POI's bookings array from itinerary day activities (days → bookings sync).
 * Reads fresh data from the DB, compares, and updates if changed.
 */
export async function rebuildPOIBookingsFromDays(tripId: string, poiId: string): Promise<void> {
  // 1. Fetch all itinerary days for the trip
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select('date, activities')
    .eq('trip_id', tripId);
  if (daysError) throw daysError;

  // 2. Scan activities in each day for this POI
  type Activity = { id: string; type: string; schedule_state?: string; time_window?: { start?: string; end?: string } };
  const newBookings: POIBooking[] = [];
  for (const day of days || []) {
    const dayDate = day.date as string | null;
    if (!dayDate) continue;
    const activities = (day.activities || []) as Activity[];
    const match = activities.find(a => a.type === 'poi' && a.id === poiId);
    if (match) {
      newBookings.push({
        reservation_date: dayDate,
        reservation_hour: match.time_window?.start || undefined,
        schedule_state: match.schedule_state === 'scheduled' ? 'scheduled' : 'potential',
      });
    }
  }

  // 3. Fetch current POI to preserve number_of_people
  const { data: poiRow, error: poiError } = await supabase
    .from('points_of_interest')
    .select('details')
    .eq('id', poiId)
    .single();
  if (poiError) throw poiError;

  const details = normalizeDetails((poiRow.details as Record<string, unknown>) || {});
  const existingBookings = details.bookings || [];

  // Preserve number_of_people from existing bookings
  for (const nb of newBookings) {
    const existing = existingBookings.find(e => e.reservation_date === nb.reservation_date);
    if (existing?.number_of_people) nb.number_of_people = existing.number_of_people;
  }

  // 4. Compare and update if changed
  const oldKey = JSON.stringify(existingBookings.map(b => `${b.reservation_date}|${b.reservation_hour || ''}|${b.schedule_state || ''}`).sort());
  const newKey = JSON.stringify(newBookings.map(b => `${b.reservation_date}|${b.reservation_hour || ''}|${b.schedule_state || ''}`).sort());
  if (oldKey === newKey) return;

  details.bookings = newBookings.length > 0 ? newBookings : undefined;
  const { error: updateError } = await supabase
    .from('points_of_interest')
    .update({ details: details as unknown as Json })
    .eq('id', poiId);
  if (updateError) throw updateError;
}

export function mapPOI(row: Record<string, unknown>): PointOfInterest {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    category: row.category as PointOfInterest['category'],
    subCategory: (row.sub_category as string) || undefined,
    name: row.name as string,
    status: (row.status as PointOfInterest['status']) || 'candidate',
    location: (row.location as POILocation) || {},
    sourceRefs: (row.source_refs as SourceRefs) || { email_ids: [], recommendation_ids: [] },
    details: normalizeDetails((row.details as Record<string, unknown>) || {}),
    isCancelled: (row.is_cancelled as boolean) || false,
    isPaid: (row.is_paid as boolean) || false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
