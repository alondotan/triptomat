import { useMemo } from 'react';
import { eachDayOfInterval, parseISO, format, addDays } from 'date-fns';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';

export interface TripDay {
  dayNum: number;        // 1-indexed
  date?: Date;           // Real date (detailed_planning only)
  dateStr?: string;      // "YYYY-MM-DD" (detailed_planning only)
  label: string;         // "Day 1" or "Mon 15 Mar"
  shortLabel: {
    line1: string;       // "EEE" or "Day"
    line2: string;       // "d" or dayNum
    line3: string;       // "MMM" or ""
  };
}

export function useTripDays(): TripDay[] {
  const { activeTrip } = useActiveTrip();

  return useMemo(() => {
    if (!activeTrip) return [];

    const status = activeTrip.status;

    // Detailed planning (or active/completed): real dates
    if ((status === 'detailed_planning' || status === 'active' || status === 'completed') &&
        activeTrip.startDate && activeTrip.endDate) {
      const dates = eachDayOfInterval({
        start: parseISO(activeTrip.startDate),
        end: parseISO(activeTrip.endDate),
      });
      return dates.map((date, idx) => ({
        dayNum: idx + 1,
        date,
        dateStr: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEEE, MMM d'),
        shortLabel: {
          line1: format(date, 'EEE'),
          line2: format(date, 'd'),
          line3: format(date, 'MMM'),
        },
      }));
    }

    // Planning mode: day numbers only
    if (status === 'planning' && activeTrip.numberOfDays) {
      return Array.from({ length: activeTrip.numberOfDays }, (_, i) => ({
        dayNum: i + 1,
        label: `Day ${i + 1}`,
        shortLabel: {
          line1: 'Day',
          line2: String(i + 1),
          line3: '',
        },
      }));
    }

    // Research mode: no days
    return [];
  }, [activeTrip?.status, activeTrip?.startDate, activeTrip?.endDate, activeTrip?.numberOfDays]);
}

/** Get a date string for a given day number within a trip (for creating itinerary days) */
export function tripDayDate(startDate: string | undefined, dayNum: number): string | undefined {
  if (!startDate) return undefined;
  return format(addDays(parseISO(startDate), dayNum - 1), 'yyyy-MM-dd');
}
