import { supabase } from '@/integrations/supabase/client';
import { Trip, Collection } from '@/types/trip';
import { fetchItineraryDays, updateItineraryDay } from './itineraryService';
import { seedTripLocations } from './tripLocationService';
import { seedTripFestivals } from './festivalService';
import { ensureDefaultItineraryLocation } from './itineraryLocationService';

// ============================================================
// TRIPS
// ============================================================
export async function fetchTrips(): Promise<Trip[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Always fetch trips directly first (works pre- and post-migration)
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const trips = (data || []).map(row => mapTrip(row));

  // Try to enrich with role from trip_members (post-migration)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memberData, error: memberError } = await (supabase as any)
      .from('trip_members')
      .select('trip_id, role')
      .eq('user_id', user.id);

    if (!memberError && memberData) {
      const roleMap = new Map<string, string>();
      for (const row of memberData) roleMap.set(row.trip_id, row.role);
      for (const trip of trips) {
        trip.myRole = (roleMap.get(trip.id) as Trip['myRole']) || 'owner';
      }
    }
  } catch {
    // trip_members doesn't exist yet — all trips default to 'owner'
  }

  return trips;
}

export async function createTrip(trip: Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trip> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('trips')
    .insert({
      name: trip.name,
      description: trip.description,
      start_date: trip.startDate || null,
      end_date: trip.endDate || null,
      number_of_days: trip.numberOfDays || null,
      currency: trip.currency,
      countries: trip.countries,
      status: trip.status || 'research',
      user_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  const mapped = mapTrip(data);

  // Seed location tree from global hierarchy for selected countries
  if (mapped.countries.length > 0) {
    try {
      await seedTripLocations(mapped.id, mapped.countries);
    } catch (e) {
      console.error('Failed to seed trip locations:', e);
    }

    // Seed festivals/holidays (fire-and-forget)
    seedTripFestivals(mapped.id, mapped.countries, mapped.startDate).catch(e =>
      console.error('Failed to seed trip festivals:', e)
    );
  }

  // Create default "General" itinerary location
  try {
    await ensureDefaultItineraryLocation(mapped.id);
  } catch (e) {
    console.error('Failed to create default itinerary location:', e);
  }

  return mapped;
}

export async function updateTrip(tripId: string, updates: Partial<Trip>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if ('startDate' in updates) updateData.start_date = updates.startDate || null;
  if ('endDate' in updates) updateData.end_date = updates.endDate || null;
  if ('numberOfDays' in updates) updateData.number_of_days = updates.numberOfDays || null;
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

function mapTrip(row: Record<string, unknown>, role?: string): Trip {
  const startDate = (row.start_date as string) || undefined;
  const endDate = (row.end_date as string) || undefined;
  const numberOfDays = (row.number_of_days as number) || undefined;
  let status = (row.status as Trip['status']) || 'research';

  // Auto-correct status based on actual data for pre-existing trips
  if (startDate && endDate && status !== 'detailed_planning' && status !== 'active' && status !== 'completed') {
    status = 'detailed_planning';
  } else if (!startDate && !endDate && numberOfDays && status === 'detailed_planning') {
    status = 'planning';
  }

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    countries: (row.countries as string[]) || [],
    startDate,
    endDate,
    numberOfDays,
    status,
    currency: (row.currency as Trip['currency']) || 'USD',
    myRole: (role as Trip['myRole']) || 'owner',
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
    status: (row.status as Collection['status']) || 'suggested',
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
