import { addDays, parseISO, format, differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { updateTrip } from './tripService';
import { fetchItineraryDays, updateItineraryDay } from '@/features/itinerary/itineraryService';
import type { Trip, ItineraryDay } from '@/types/trip';

/**
 * Transition from planning → detailed_planning:
 * - Sets startDate / endDate on the trip
 * - Converts itinerary day numbers to real dates
 */
export async function transitionToDetailedPlanning(
  trip: Trip,
  startDate: string,
): Promise<Partial<Trip>> {
  const days = trip.numberOfDays || 7;
  const start = parseISO(startDate);
  const endDate = format(addDays(start, days - 1), 'yyyy-MM-dd');

  // Update itinerary days: set date based on dayNumber
  const itDays = await fetchItineraryDays(trip.id);
  for (const itDay of itDays) {
    const dayDate = format(addDays(start, itDay.dayNumber - 1), 'yyyy-MM-dd');
    await updateItineraryDay(itDay.id, { date: dayDate });
  }

  // Update POI bookings: convert trip_day_number → reservation_date
  await convertPoiDayNumbersToDates(trip.id, startDate);

  // Update transport segments: convert day numbers to ISO datetimes
  await convertTransportDayNumbersToDates(trip.id, startDate);

  // Update accommodation: convert day numbers to dates
  await convertAccommodationDayNumbersToDates(trip.id, startDate);

  // Update trip itself
  const updates: Partial<Trip> = {
    status: 'detailed_planning',
    startDate,
    endDate,
    numberOfDays: days,
  };
  await updateTrip(trip.id, updates);
  return updates;
}

/**
 * Transition from detailed_planning → planning:
 * - Clears startDate / endDate
 * - Keeps numberOfDays
 * - Clears dates from itinerary days (keeps dayNumber)
 */
export async function transitionToPlanning(
  trip: Trip,
): Promise<Partial<Trip>> {
  const days = trip.numberOfDays ||
    (trip.startDate && trip.endDate
      ? differenceInCalendarDays(parseISO(trip.endDate), parseISO(trip.startDate)) + 1
      : undefined);

  // Clear dates from itinerary days
  const itDays = await fetchItineraryDays(trip.id);
  for (const itDay of itDays) {
    if (itDay.date) {
      await updateItineraryDay(itDay.id, { date: undefined });
    }
  }

  // Convert POI reservation_dates → trip_day_number
  if (trip.startDate) {
    await convertPoiDatesToDayNumbers(trip.id, trip.startDate);
  }

  // Convert transport ISO datetimes → day numbers
  if (trip.startDate) {
    await convertTransportDatesToDayNumbers(trip.id, trip.startDate);
  }

  // Convert accommodation dates → day numbers
  if (trip.startDate) {
    await convertAccommodationDatesToDayNumbers(trip.id, trip.startDate);
  }

  const updates: Partial<Trip> = {
    status: 'planning',
    startDate: undefined,
    endDate: undefined,
    numberOfDays: days,
  };
  await updateTrip(trip.id, updates);
  return updates;
}

/**
 * Transition to research:
 * - Clears all dates, numberOfDays
 * - Clears itinerary day dates
 */
export async function transitionToResearch(
  trip: Trip,
): Promise<Partial<Trip>> {
  // Clear dates from itinerary days
  const itDays = await fetchItineraryDays(trip.id);
  for (const itDay of itDays) {
    if (itDay.date) {
      await updateItineraryDay(itDay.id, { date: undefined });
    }
  }

  const updates: Partial<Trip> = {
    status: 'research',
    startDate: undefined,
    endDate: undefined,
    numberOfDays: undefined,
  };
  await updateTrip(trip.id, updates);
  return updates;
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function convertPoiDayNumbersToDates(tripId: string, startDate: string) {
  const { data: pois } = await supabase
    .from('points_of_interest')
    .select('id, details')
    .eq('trip_id', tripId);

  if (!pois) return;
  const start = parseISO(startDate);

  for (const poi of pois) {
    const details = poi.details as Record<string, unknown> | null;
    if (!details) continue;

    let changed = false;

    // Convert bookings
    const bookings = (details.bookings as Array<Record<string, unknown>>) || [];
    for (const b of bookings) {
      if (b.trip_day_number && !b.reservation_date) {
        b.reservation_date = format(addDays(start, Number(b.trip_day_number) - 1), 'yyyy-MM-dd');
        changed = true;
      }
    }

    // Convert accommodation
    const accom = details.accommodation_details as Record<string, unknown> | undefined;
    if (accom) {
      if (accom.checkin_day_number && !accom.checkin) {
        const checkinDate = format(addDays(start, Number(accom.checkin_day_number) - 1), 'yyyy-MM-dd');
        accom.checkin = { ...(accom.checkin as Record<string, unknown> || {}), date: checkinDate };
        changed = true;
      }
      if (accom.checkout_day_number && !accom.checkout) {
        const checkoutDate = format(addDays(start, Number(accom.checkout_day_number) - 1), 'yyyy-MM-dd');
        accom.checkout = { ...(accom.checkout as Record<string, unknown> || {}), date: checkoutDate };
        changed = true;
      }
    }

    if (changed) {
      await supabase.from('points_of_interest').update({ details: details as unknown as import('@/integrations/supabase/types').Json }).eq('id', poi.id);
    }
  }
}

async function convertPoiDatesToDayNumbers(tripId: string, startDate: string) {
  const { data: pois } = await supabase
    .from('points_of_interest')
    .select('id, details')
    .eq('trip_id', tripId);

  if (!pois) return;
  const start = parseISO(startDate);

  for (const poi of pois) {
    const details = poi.details as Record<string, unknown> | null;
    if (!details) continue;

    let changed = false;

    const bookings = (details.bookings as Array<Record<string, unknown>>) || [];
    for (const b of bookings) {
      if (b.reservation_date) {
        b.trip_day_number = differenceInCalendarDays(parseISO(b.reservation_date as string), start) + 1;
        changed = true;
      }
    }

    const accom = details.accommodation_details as Record<string, unknown> | undefined;
    if (accom) {
      const checkin = accom.checkin as Record<string, unknown> | undefined;
      if (checkin?.date) {
        accom.checkin_day_number = differenceInCalendarDays(parseISO(checkin.date as string), start) + 1;
        changed = true;
      }
      const checkout = accom.checkout as Record<string, unknown> | undefined;
      if (checkout?.date) {
        accom.checkout_day_number = differenceInCalendarDays(parseISO(checkout.date as string), start) + 1;
        changed = true;
      }
    }

    if (changed) {
      await supabase.from('points_of_interest').update({ details: details as unknown as import('@/integrations/supabase/types').Json }).eq('id', poi.id);
    }
  }
}

async function convertTransportDayNumbersToDates(tripId: string, startDate: string) {
  const { data: transports } = await supabase
    .from('transportation')
    .select('id, segments')
    .eq('trip_id', tripId);

  if (!transports) return;
  const start = parseISO(startDate);

  for (const t of transports) {
    const segments = (t.segments as Array<Record<string, unknown>>) || [];
    let changed = false;

    for (const seg of segments) {
      if (seg.departure_day_number && !seg.departure_time) {
        const dayDate = addDays(start, Number(seg.departure_day_number) - 1);
        seg.departure_time = format(dayDate, "yyyy-MM-dd'T'00:00:00");
        changed = true;
      }
      if (seg.arrival_day_number && !seg.arrival_time) {
        const dayDate = addDays(start, Number(seg.arrival_day_number) - 1);
        seg.arrival_time = format(dayDate, "yyyy-MM-dd'T'00:00:00");
        changed = true;
      }
    }

    if (changed) {
      await supabase.from('transportation').update({ segments }).eq('id', t.id);
    }
  }
}

async function convertTransportDatesToDayNumbers(tripId: string, startDate: string) {
  const { data: transports } = await supabase
    .from('transportation')
    .select('id, segments')
    .eq('trip_id', tripId);

  if (!transports) return;
  const start = parseISO(startDate);

  for (const t of transports) {
    const segments = (t.segments as Array<Record<string, unknown>>) || [];
    let changed = false;

    for (const seg of segments) {
      if (seg.departure_time) {
        const dt = parseISO(seg.departure_time as string);
        seg.departure_day_number = differenceInCalendarDays(dt, start) + 1;
        changed = true;
      }
      if (seg.arrival_time) {
        const dt = parseISO(seg.arrival_time as string);
        seg.arrival_day_number = differenceInCalendarDays(dt, start) + 1;
        changed = true;
      }
    }

    if (changed) {
      await supabase.from('transportation').update({ segments }).eq('id', t.id);
    }
  }
}

async function convertAccommodationDayNumbersToDates(tripId: string, startDate: string) {
  // Already handled in convertPoiDayNumbersToDates (accommodation is a POI type)
}

async function convertAccommodationDatesToDayNumbers(tripId: string, startDate: string) {
  // Already handled in convertPoiDatesToDayNumbers (accommodation is a POI type)
}
