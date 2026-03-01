import { supabase } from '@/integrations/supabase/client';
import { Trip, Collection } from '@/types/trip';
import { fetchItineraryDays, updateItineraryDay } from './itineraryService';

// ============================================================
// TRIPS
// ============================================================
export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapTrip);
}

export async function createTrip(trip: Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trip> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('trips')
    .insert({
      name: trip.name,
      description: trip.description,
      start_date: trip.startDate,
      end_date: trip.endDate,
      currency: trip.currency,
      countries: trip.countries,
      status: trip.status || 'research',
      user_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return mapTrip(data);
}

export async function updateTrip(tripId: string, updates: Partial<Trip>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
  if (updates.endDate !== undefined) updateData.end_date = updates.endDate;
  if (updates.currency !== undefined) updateData.currency = updates.currency;
  if (updates.countries !== undefined) updateData.countries = updates.countries;
  if (updates.status !== undefined) updateData.status = updates.status;

  const { error } = await supabase.from('trips').update(updateData).eq('id', tripId);
  if (error) throw error;
}

export async function deleteTrip(tripId: string): Promise<void> {
  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) throw error;
}

function mapTrip(row: Record<string, unknown>): Trip {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    countries: (row.countries as string[]) || [],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    status: (row.status as Trip['status']) || 'research',
    currency: (row.currency as Trip['currency']) || 'USD',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================
// COLLECTIONS
// ============================================================
export async function fetchCollections(tripId: string): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapCollection);
}

function mapCollection(row: Record<string, unknown>): Collection {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    collectionName: row.collection_name as string,
    status: (row.status as Collection['status']) || 'candidate',
    timeWindow: (row.time_window as Collection['timeWindow']) || {},
    items: (row.items as Collection['items']) || [],
    sourceRefs: (row.source_refs as Collection['sourceRefs']) || { recommendation_ids: [] },
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================
// CROSS-DOMAIN: ITINERARY REFERENCE REPAIR
// ============================================================

/**
 * After merging, remap itinerary_days references from secondaryId → primaryId.
 */
export async function repairItineraryReferences(
  tripId: string,
  secondaryId: string,
  primaryId: string,
  entityType: 'poi' | 'transportation',
): Promise<void> {
  const days = await fetchItineraryDays(tripId);
  for (const day of days) {
    let changed = false;

    if (entityType === 'poi') {
      const newAccomm = day.accommodationOptions.map(opt => {
        if (opt.poi_id === secondaryId) { changed = true; return { ...opt, poi_id: primaryId }; }
        return opt;
      });
      const seenAccomm = new Set<string>();
      const dedupedAccomm = newAccomm.filter(opt => {
        if (seenAccomm.has(opt.poi_id)) return false;
        seenAccomm.add(opt.poi_id);
        return true;
      });

      const newActivities = day.activities.map(act => {
        if (act.type === 'poi' && act.id === secondaryId) { changed = true; return { ...act, id: primaryId }; }
        return act;
      });
      const seenAct = new Set<string>();
      const dedupedActivities = newActivities.filter(act => {
        if (act.type !== 'poi') return true;
        if (seenAct.has(act.id)) return false;
        seenAct.add(act.id);
        return true;
      });

      if (changed) {
        await updateItineraryDay(day.id, {
          accommodationOptions: dedupedAccomm,
          activities: dedupedActivities,
        });
      }
    } else {
      const newSegments = day.transportationSegments.map(seg => {
        if (seg.transportation_id === secondaryId) { changed = true; return { ...seg, transportation_id: primaryId }; }
        return seg;
      });
      const seenSeg = new Set<string>();
      const dedupedSegments = newSegments.filter(seg => {
        const key = `${seg.transportation_id}_${seg.segment_id || ''}`;
        if (seenSeg.has(key)) return false;
        seenSeg.add(key);
        return true;
      });

      if (changed) {
        await updateItineraryDay(day.id, { transportationSegments: dedupedSegments });
      }
    }
  }
}
