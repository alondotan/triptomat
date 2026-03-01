import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  Trip, PointOfInterest, Transportation, Collection,
  Mission, ItineraryDay, POILocation, SourceRefs, POIDetails,
  TransportCost, TransportBooking, TransportSegment,
  Contact,
} from '@/types/trip';

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
// POINTS OF INTEREST
// ============================================================
export async function fetchPOIs(tripId: string): Promise<PointOfInterest[]> {
  const { data, error } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapPOI);
}

// ── Merge utilities ─────────────────────────────────────────────

export function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

export function mergeWithNewWins(old: unknown, incoming: unknown): unknown {
  if (!hasValue(incoming)) return old;
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  if (typeof old !== 'object' || old === null || Array.isArray(old)) return incoming;
  const result: Record<string, unknown> = { ...(old as Record<string, unknown>) };
  for (const key of Object.keys(incoming as Record<string, unknown>)) {
    result[key] = mergeWithNewWins(
      (old as Record<string, unknown>)[key],
      (incoming as Record<string, unknown>)[key],
    );
  }
  return result;
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

export const STATUS_PRIORITY: Record<string, number> = {
  booked: 4, visited: 3, in_plan: 2, matched: 1, candidate: 0,
};

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

function mapPOI(row: Record<string, unknown>): PointOfInterest {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    category: row.category as PointOfInterest['category'],
    subCategory: (row.sub_category as string) || undefined,
    name: row.name as string,
    status: (row.status as PointOfInterest['status']) || 'candidate',
    location: (row.location as POILocation) || {},
    sourceRefs: (row.source_refs as SourceRefs) || { email_ids: [], recommendation_ids: [] },
    details: (row.details as POIDetails) || {},
    isCancelled: (row.is_cancelled as boolean) || false,
    isPaid: (row.is_paid as boolean) || false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================
// TRANSPORTATION
// ============================================================
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

function mapTransportation(row: Record<string, unknown>): Transportation {
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

// ============================================================
// MISSIONS
// ============================================================
export async function fetchMissions(tripId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapMission);
}

export async function createMission(m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>): Promise<Mission> {
  const insertData = {
    trip_id: m.tripId,
    title: m.title,
    description: m.description,
    status: m.status,
    due_date: m.dueDate,
    context_links: m.contextLinks,
    reminders: m.reminders as unknown as Json,
    object_link: m.objectLink,
  };
  const { data, error } = await supabase
    .from('missions')
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return mapMission(data);
}

export async function updateMission(id: string, updates: Partial<Mission>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate;
  if (updates.contextLinks !== undefined) updateData.context_links = updates.contextLinks;
  if (updates.reminders !== undefined) updateData.reminders = updates.reminders;
  if (updates.objectLink !== undefined) updateData.object_link = updates.objectLink;

  const { error } = await supabase.from('missions').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('missions').delete().eq('id', id);
  if (error) throw error;
}

function mapMission(row: Record<string, unknown>): Mission {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    status: (row.status as Mission['status']) || 'pending',
    dueDate: (row.due_date as string) || undefined,
    contextLinks: (row.context_links as string[]) || [],
    reminders: (row.reminders as Mission['reminders']) || [],
    objectLink: (row.object_link as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================
// ITINERARY DAYS
// ============================================================
export async function fetchItineraryDays(tripId: string): Promise<ItineraryDay[]> {
  const { data, error } = await supabase
    .from('itinerary_days')
    .select('*')
    .eq('trip_id', tripId)
    .order('day_number', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapItineraryDay);
}

export async function createItineraryDay(day: Omit<ItineraryDay, 'id' | 'createdAt' | 'updatedAt'>): Promise<ItineraryDay> {
  const insertData = {
    trip_id: day.tripId,
    day_number: day.dayNumber,
    date: day.date,
    location_context: day.locationContext,
    accommodation_options: day.accommodationOptions as unknown as Json,
    activities: day.activities as unknown as Json,
    transportation_segments: day.transportationSegments as unknown as Json,
  };
  const { data, error } = await supabase
    .from('itinerary_days')
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return mapItineraryDay(data);
}

export async function updateItineraryDay(id: string, updates: Partial<ItineraryDay>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.dayNumber !== undefined) updateData.day_number = updates.dayNumber;
  if (updates.date !== undefined) updateData.date = updates.date;
  if (updates.locationContext !== undefined) updateData.location_context = updates.locationContext;
  if (updates.accommodationOptions !== undefined) updateData.accommodation_options = updates.accommodationOptions;
  if (updates.activities !== undefined) updateData.activities = updates.activities;
  if (updates.transportationSegments !== undefined) updateData.transportation_segments = updates.transportationSegments;

  const { error } = await supabase.from('itinerary_days').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteItineraryDay(id: string): Promise<void> {
  const { error } = await supabase.from('itinerary_days').delete().eq('id', id);
  if (error) throw error;
}

function mapItineraryDay(row: Record<string, unknown>): ItineraryDay {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    dayNumber: row.day_number as number,
    date: (row.date as string) || undefined,
    locationContext: (row.location_context as string) || undefined,
    accommodationOptions: (row.accommodation_options as ItineraryDay['accommodationOptions']) || [],
    activities: (row.activities as ItineraryDay['activities']) || [],
    transportationSegments: (row.transportation_segments as ItineraryDay['transportationSegments']) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================================
// EXPENSES
// ============================================================
import type { Expense } from '@/types/trip';

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

// ============================================================
// CONTACTS
// ============================================================
export async function fetchContacts(tripId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapContact);
}

export async function createContact(c: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .insert([{
      trip_id: c.tripId,
      name: c.name,
      role: c.role,
      phone: c.phone || null,
      email: c.email || null,
      website: c.website || null,
      notes: c.notes || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return mapContact(data);
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.website !== undefined) updateData.website = updates.website;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  const { error } = await supabase.from('contacts').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    role: (row.role as Contact['role']) || 'other',
    phone: (row.phone as string) || undefined,
    email: (row.email as string) || undefined,
    website: (row.website as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
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
// MANUAL MERGE
// ============================================================

const TRANSPORT_STATUS_PRIORITY: Record<string, number> = {
  completed: 4, booked: 3, in_plan: 2, candidate: 0,
};

function mergeSourceRefs(a: SourceRefs, b: SourceRefs): SourceRefs {
  return {
    email_ids: [...new Set([...(a.email_ids || []), ...(b.email_ids || [])])],
    recommendation_ids: [...new Set([...(a.recommendation_ids || []), ...(b.recommendation_ids || [])])],
  };
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
