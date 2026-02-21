import { supabase } from "@/integrations/supabase/client";

function toUtcMidnight(dateStr: string): number {
  // dateStr expected: YYYY-MM-DD
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
