import type { Json } from '@/integrations/supabase/types';
import { ItineraryDay, POIBooking } from '@/types/trip';
import { supabase } from './helpers';

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

// ── From itineraryDayService.ts ─────────────────────────────────────────────

function toUtcMidnight(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function diffDaysUtc(startDate: string, endDate: string): number {
  return Math.floor((toUtcMidnight(endDate) - toUtcMidnight(startDate)) / (1000 * 60 * 60 * 24));
}

export type ItineraryDayLite = {
  id: string;
  day_number: number;
  date: string | null;
  transportation_segments: unknown;
};

/**
 * Ensures an itinerary day exists for a specific date within the trip range.
 * Returns the existing/created day row, or null if the date is outside the trip range.
 */
export async function ensureItineraryDayForDate(tripId: string, date: string): Promise<ItineraryDayLite | null> {
  // 1) If already exists, return it
  const { data: existing, error: existingError } = await supabase
    .from("itinerary_days")
    .select("id, day_number, date, transportation_segments")
    .eq("trip_id", tripId)
    .eq("date", date)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as unknown as ItineraryDayLite;

  // 2) Validate date in trip range + compute day_number
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("start_date, end_date")
    .eq("id", tripId)
    .single();

  if (tripError) throw tripError;

  const start = trip.start_date as string;
  const end = trip.end_date as string;
  if (!start || !end) return null;
  if (date < start || date > end) return null;

  let dayNumber = diffDaysUtc(start, date) + 1;
  dayNumber = Math.max(1, dayNumber);

  // 3) Avoid day_number collisions (rare but possible with partial/malformed itineraries)
  const { data: dayNums, error: dayNumsError } = await supabase
    .from("itinerary_days")
    .select("day_number")
    .eq("trip_id", tripId);

  if (dayNumsError) throw dayNumsError;

  const used = new Set<number>((dayNums || []).map((r: any) => r.day_number).filter((n: any) => typeof n === "number"));
  while (used.has(dayNumber)) dayNumber += 1;

  const { data: created, error: createError } = await supabase
    .from("itinerary_days")
    .insert([
      {
        trip_id: tripId,
        day_number: dayNumber,
        date,
      },
    ])
    .select("id, day_number, date, transportation_segments")
    .single();

  if (createError) throw createError;
  return created as unknown as ItineraryDayLite;
}

/**
 * Syncs a POI's bookings to itinerary days:
 * - For each booking with a reservation_date, ensures the POI is on the matching day
 * - Sets time_window.start from the booking's reservation_hour
 * - Removes the POI from days whose dates no longer match any booking
 */
export async function syncActivityBookingsToDays(
  tripId: string,
  poiId: string,
  bookings: POIBooking[],
): Promise<void> {
  const bookingDates = new Set(
    bookings.map(b => b.reservation_date).filter((d): d is string => !!d),
  );
  if (bookingDates.size === 0) return;

  // Build a map: bookingDate → reservation_hour
  const dateToHour = new Map<string, string | undefined>();
  for (const b of bookings) {
    if (b.reservation_date) dateToHour.set(b.reservation_date, b.reservation_hour);
  }

  // Fetch all existing itinerary days for this trip
  const { data: allDays } = await supabase
    .from('itinerary_days')
    .select('*')
    .eq('trip_id', tripId);
  const days = allDays || [];

  // 1) Remove POI from days whose date no longer matches any booking
  for (const day of days) {
    const activities = (day.activities || []) as Array<{ id: string; type: string; order: number; schedule_state?: string; time_window?: { start?: string; end?: string } }>;
    const idx = activities.findIndex(a => a.type === 'poi' && a.id === poiId);
    if (idx === -1) continue;

    const dayDate = day.date as string | null;
    if (dayDate && !bookingDates.has(dayDate)) {
      // Day has this POI but no matching booking → remove
      activities.splice(idx, 1);
      await supabase.from('itinerary_days').update({ activities }).eq('id', day.id);
    } else if (dayDate && bookingDates.has(dayDate)) {
      // Day matches a booking → update time_window
      const hour = dateToHour.get(dayDate);
      if (hour) {
        activities[idx] = {
          ...activities[idx],
          time_window: { start: hour, end: activities[idx].time_window?.end },
          schedule_state: 'scheduled',
        };
        await supabase.from('itinerary_days').update({ activities }).eq('id', day.id);
      }
    }
  }

  // 2) Add POI to days where it's missing
  for (const date of bookingDates) {
    const existingDay = days.find(d => d.date === date);
    const hour = dateToHour.get(date);

    if (existingDay) {
      const activities = (existingDay.activities || []) as Array<{ id: string; type: string; order: number; time_window?: { start?: string; end?: string }; schedule_state?: string }>;
      if (!activities.some(a => a.type === 'poi' && a.id === poiId)) {
        activities.push({
          order: activities.length + 1,
          type: 'poi',
          id: poiId,
          schedule_state: hour ? 'scheduled' : undefined,
          time_window: hour ? { start: hour } : undefined,
        });
        await supabase.from('itinerary_days').update({ activities }).eq('id', existingDay.id);
      }
    } else {
      // Create the day and add the POI
      const created = await ensureItineraryDayForDate(tripId, date);
      if (created) {
        const activities = [{
          order: 1,
          type: 'poi',
          id: poiId,
          schedule_state: hour ? 'scheduled' : undefined,
          time_window: hour ? { start: hour } : undefined,
        }];
        await supabase.from('itinerary_days').update({ activities }).eq('id', created.id);
      }
    }
  }
}
