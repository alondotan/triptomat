import { ItineraryLocation } from '@/types/trip';
import { supabase } from './helpers';

// ── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchItineraryLocations(tripId: string): Promise<ItineraryLocation[]> {
  const { data, error } = await supabase
    .from('itinerary_locations')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapItineraryLocation);
}

// ── Ensure default ──────────────────────────────────────────────────────────

export async function ensureDefaultItineraryLocation(tripId: string): Promise<ItineraryLocation> {
  // Try to find existing default
  const { data: existing, error: findError } = await supabase
    .from('itinerary_locations')
    .select('*')
    .eq('trip_id', tripId)
    .eq('is_default', true)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return mapItineraryLocation(existing);

  // Create default
  const { data, error } = await supabase
    .from('itinerary_locations')
    .insert({ trip_id: tripId, trip_location_id: null, is_default: true, sort_order: 0 })
    .select()
    .single();

  if (error) throw error;
  return mapItineraryLocation(data);
}

// ── Find or create by trip_location_id ──────────────────────────────────────

export async function findOrCreateItineraryLocation(
  tripId: string,
  tripLocationId: string,
): Promise<ItineraryLocation> {
  // Try to find existing
  const { data: existing, error: findError } = await supabase
    .from('itinerary_locations')
    .select('*')
    .eq('trip_id', tripId)
    .eq('trip_location_id', tripLocationId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return mapItineraryLocation(existing);

  // Create new
  const { data, error } = await supabase
    .from('itinerary_locations')
    .insert({ trip_id: tripId, trip_location_id: tripLocationId, is_default: false, sort_order: 1 })
    .select()
    .single();

  if (error) throw error;
  return mapItineraryLocation(data);
}

// ── Assign days ─────────────────────────────────────────────────────────────

export async function assignDayToLocation(dayId: string, itineraryLocationId: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_days')
    .update({ itinerary_location_id: itineraryLocationId })
    .eq('id', dayId);

  if (error) throw error;
}

export async function assignDaysToLocation(dayIds: string[], itineraryLocationId: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_days')
    .update({ itinerary_location_id: itineraryLocationId })
    .in('id', dayIds);

  if (error) throw error;
}

// ── Mapper ──────────────────────────────────────────────────────────────────

function mapItineraryLocation(row: Record<string, unknown>): ItineraryLocation {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    tripLocationId: (row.trip_location_id as string) || null,
    isDefault: row.is_default as boolean,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
