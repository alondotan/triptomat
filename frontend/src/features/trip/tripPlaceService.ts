import { supabase } from '@/integrations/supabase/client';
import type { TripPlace } from '@/types/trip';

// ── Mapper ──────────────────────────────────────────────────

function mapTripPlace(row: Record<string, unknown>): TripPlace {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    tripLocationId: row.trip_location_id as string,
    potentialActivityIds: (row.potential_activity_ids as string[]) || [],
    notes: (row.notes as string) || '',
    imageUrl: (row.image_url as string) || '',
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── Fetch ────────────────────────────────────────────────────

export async function fetchTripPlaces(tripId: string): Promise<TripPlace[]> {
  const { data, error } = await supabase
    .from('trip_places')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapTripPlace);
}

// ── Create ───────────────────────────────────────────────────

export async function createTripPlace(
  tripId: string,
  tripLocationId: string,
  options: { notes?: string; imageUrl?: string; sortOrder?: number; locationName?: string; country?: string } = {},
): Promise<TripPlace> {
  const { data, error } = await supabase
    .from('trip_places')
    .insert({
      trip_id: tripId,
      trip_location_id: tripLocationId,
      notes: options.notes || '',
      image_url: options.imageUrl || '',
      sort_order: options.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  const tripPlace = mapTripPlace(data as Record<string, unknown>);

  // Fire-and-forget: fetch place image server-side (edge function — bypasses browser CORS/CSP/RLS)
  if (!options.imageUrl && options.locationName) {
    supabase.functions.invoke('fetch-poi-image', {
      body: {
        tripPlaceId: tripPlace.id,
        locationName: options.locationName,
        country: options.country,
      },
    }).catch(err => console.warn('[createTripPlace] Image enrichment failed:', err));
  }

  return tripPlace;
}

// ── Update ───────────────────────────────────────────────────

export async function updateTripPlace(
  id: string,
  updates: Partial<Pick<TripPlace, 'notes' | 'imageUrl' | 'sortOrder' | 'potentialActivityIds'>>,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;
  if (updates.potentialActivityIds !== undefined) updateData.potential_activity_ids = updates.potentialActivityIds;

  const { error } = await supabase.from('trip_places').update(updateData).eq('id', id);
  if (error) throw error;
}

// ── Delete ───────────────────────────────────────────────────

/**
 * Delete a trip place and its holding days.
 * The geo hierarchy node (trip_location) is untouched — it stays in the knowledge base.
 */
export async function deleteTripPlace(id: string): Promise<void> {
  // Unlink days first (FK is SET NULL so this is a safety measure for cleanup)
  const { error: daysError } = await supabase
    .from('itinerary_days')
    .delete()
    .eq('trip_place_id', id);
  if (daysError) throw daysError;

  const { error } = await supabase.from('trip_places').delete().eq('id', id);
  if (error) throw error;
}

// ── Reorder ──────────────────────────────────────────────────

export async function reorderTripPlaces(
  orderedIds: { id: string; sortOrder: number }[],
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map(({ id, sortOrder }) =>
      supabase.from('trip_places').update({ sort_order: sortOrder }).eq('id', id),
    ),
  );
  const err = results.find(r => r.error);
  if (err?.error) throw err.error;
}

// ── Image ────────────────────────────────────────────────────

export async function updateTripPlaceImage(id: string, imageUrl: string): Promise<void> {
  const { error } = await supabase.from('trip_places').update({ image_url: imageUrl }).eq('id', id);
  if (error) throw error;
}

// ── Enrich ───────────────────────────────────────────────────

/** Fire-and-forget: ask edge function to fetch and persist an image for this trip_place. */
export function enrichTripPlaceImage(tripPlaceId: string, locationName: string, country?: string): void {
  supabase.functions.invoke('fetch-poi-image', {
    body: { tripPlaceId, locationName, country },
  }).catch(err => console.warn('[enrichTripPlace] Failed:', err));
}

// ── Lookup ───────────────────────────────────────────────────

/** Find the trip_place for a given trip_location_id, or null if not yet planned. */
export function findTripPlaceByLocationId(
  tripPlaces: TripPlace[],
  tripLocationId: string,
): TripPlace | undefined {
  return tripPlaces.find(p => p.tripLocationId === tripLocationId);
}
