import { useActiveTrip } from '@/features/trip/ActiveTripContext';

export function useTripMode() {
  const { activeTrip } = useActiveTrip();
  const status = activeTrip?.status;

  return {
    isResearch: status === 'research',
    isPlanning: status === 'planning',
    isDetailedPlanning: status === 'detailed_planning' || status === 'active' || status === 'completed',
    hasDates: !!activeTrip?.startDate && !!activeTrip?.endDate,
    hasDays: (activeTrip?.numberOfDays ?? 0) > 0,
    numberOfDays: activeTrip?.numberOfDays ?? 0,
  };
}
