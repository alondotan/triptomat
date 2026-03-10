import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import {
  fetchTripWeather,
  MAX_FORECAST_DAYS,
  type DailyWeather,
  type DayLocationInput,
} from '@/services/weatherService';
import type { ItineraryDay, Trip } from '@/types/trip';

const STALE_TIME = 4 * 60 * 60 * 1000; // 4 hours

export const weatherKeys = {
  all: ['weather'] as const,
  trip: (tripId: string) => ['weather', 'trip', tripId] as const,
};

/**
 * Returns weather forecast per day for a trip's itinerary.
 *
 * For each ItineraryDay it uses `locationContext` as the location name;
 * if missing, falls back to the first country in the trip.
 *
 * Automatically disables itself when:
 * - trip has no start date
 * - trip start date is more than 16 days away
 * - no itinerary days are provided
 *
 * @returns `weatherByDate` — a Map<"YYYY-MM-DD", DailyWeather>, plus standard query state.
 */
export function useTripWeather(trip: Trip | undefined, itineraryDays: ItineraryDay[]) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const daysUntilStart = trip?.startDate
    ? differenceInCalendarDays(new Date(trip.startDate), today)
    : Infinity;

  const isInForecastRange = daysUntilStart <= MAX_FORECAST_DAYS;

  const maxForecastDate = format(
    new Date(today.getTime() + MAX_FORECAST_DAYS * 24 * 60 * 60 * 1000),
    'yyyy-MM-dd',
  );

  // Build the day→location input list, clamped to the forecast window
  const dayInputs: DayLocationInput[] = useMemo(() => {
    if (!trip?.startDate || !isInForecastRange) return [];

    const countryFallback = trip.countries[0] ?? '';

    return itineraryDays
      .filter((d) => d.date)
      .filter((d) => d.date! >= todayStr && d.date! <= maxForecastDate)
      .map((d) => ({
        date: d.date!,
        locationName: d.locationContext || countryFallback,
      }))
      .filter((d) => d.locationName !== '');
  }, [trip?.startDate, trip?.countries, itineraryDays, isInForecastRange, todayStr, maxForecastDate]);

  // Stable key for the query — sorted unique location+date pairs
  const inputKey = useMemo(
    () => dayInputs.map((d) => `${d.date}:${d.locationName}`).join('|'),
    [dayInputs],
  );

  const query = useQuery({
    queryKey: [...weatherKeys.trip(trip?.id ?? ''), inputKey],
    queryFn: () => fetchTripWeather(dayInputs),
    enabled: dayInputs.length > 0,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 2,
  });

  return {
    ...query,
    weatherByDate: query.data ?? new Map<string, DailyWeather>(),
  };
}
