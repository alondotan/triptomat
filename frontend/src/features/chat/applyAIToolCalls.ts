import type { PointOfInterest } from '@/types/trip';
import type { DraftDay } from '@/types/itineraryDraft';
import type { TripContext } from './AIChatSheet';
import { supabase } from '@/integrations/supabase/client';
import { updatePOI } from '@/features/poi/poiService';
import { CATEGORY_MAP } from '@/shared/utils/categoryMap';

type ToolCall = { name: string; args: Record<string, unknown> };

type SuggestedPlace = {
  name: string; category: string; place_type?: string; activity_type?: string;
  accommodation_type?: string; eatery_type?: string; transport_type?: string;
  event_type?: string; location_id?: string; location_name?: string;
  city?: string; country?: string; why?: string;
};

interface ItineraryDayRef {
  id: string;
  date?: string | null;
}

interface ApplyAIToolCallsParams {
  toolCalls: ToolCall[];
  tripContext: TripContext;
  pois: PointOfInterest[];
  itineraryDays: ItineraryDayRef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeTrip: any;
  instantApply: boolean;
  applyToolCall: (days: unknown) => DraftDay[] | null;
  applyDayUpdate: (day: unknown) => DraftDay[] | null;
  addPOI: (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>) => Promise<unknown>;
  updateCurrentTrip: (updates: { numberOfDays?: number; startDate?: string; endDate?: string; status?: string }) => Promise<void>;
  history: { pushHistory: (days: unknown, pois: unknown, trip: unknown) => void };
  onItineraryUpdate?: (places: Array<{ name: string; day: number; location?: string }>, msgIdx: number) => void;
  onSuggestPlaces?: (places: SuggestedPlace[], msgIdx: number) => void;
  snapshotRef: { current: Map<number, DraftDay[]> };
  updatedMessagesLength: number;
}

export async function applyAIToolCalls({
  toolCalls,
  tripContext,
  pois,
  itineraryDays,
  activeTrip,
  instantApply,
  applyToolCall,
  applyDayUpdate,
  addPOI,
  updateCurrentTrip,
  history,
  onItineraryUpdate,
  onSuggestPlaces,
  snapshotRef,
  updatedMessagesLength,
}: ApplyAIToolCallsParams): Promise<{ newDays: DraftDay[] | null; shouldApply: boolean }> {
  let shouldApply = false;
  let newDays: DraftDay[] | null = null;

  for (const tc of toolCalls) {
    if (tc.name === 'set_itinerary' && tc.args?.days) {
      if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
      newDays = applyToolCall(tc.args.days);
      if (newDays) snapshotRef.current.set(updatedMessagesLength, newDays);
      if (onItineraryUpdate) {
        const places = (tc.args.days as Array<{ day_number?: number; dayNumber?: number; location_name?: string; location_context?: string; locationContext?: string; places?: Array<{ name?: string; place_name?: string; is_specific_place?: boolean; place_id?: string }> }>)
          .flatMap(d => (d.places ?? [])
            .filter(p => p.place_id || p.is_specific_place !== false)
            .map(p => ({
              name: p.place_name ?? p.name ?? '',
              day: d.day_number ?? d.dayNumber ?? 0,
              location: d.location_name ?? d.location_context ?? d.locationContext,
            }))
            .filter(p => p.name));
        onItineraryUpdate(places, updatedMessagesLength);
      }

    } else if (tc.name === 'update_day' && tc.args?.day) {
      if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
      newDays = applyDayUpdate(tc.args.day);
      if (newDays) snapshotRef.current.set(updatedMessagesLength, newDays);
      if (onItineraryUpdate) {
        const day = tc.args.day as { day_number?: number; dayNumber?: number; location_name?: string; places?: Array<{ name?: string; place_name?: string; is_specific_place?: boolean; place_id?: string }> };
        const places = (day.places ?? [])
          .filter(p => p.place_id || p.is_specific_place !== false)
          .map(p => ({
            name: p.place_name ?? p.name ?? '',
            day: day.day_number ?? day.dayNumber ?? 0,
            location: day.location_name,
          }))
          .filter(p => p.name);
        onItineraryUpdate(places, updatedMessagesLength);
      }

    } else if (tc.name === 'apply_itinerary') {
      shouldApply = true;

    } else if (tc.name === 'suggest_places' && tc.args?.places) {
      onSuggestPlaces?.(tc.args.places as SuggestedPlace[], updatedMessagesLength);

    } else if (tc.name === 'add_places' && Array.isArray(tc.args?.places) && (tc.args.places as unknown[]).length > 0) {
      if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
      await Promise.all((tc.args.places as Record<string, unknown>[]).map(p =>
        addPOI({
          tripId: tripContext.tripId,
          name: p.name as string,
          category: (CATEGORY_MAP[p.category as string] ?? p.category as PointOfInterest['category']) || 'attraction',
          placeType: (p.place_type || p.accommodation_type || p.eatery_type || p.transport_type || p.event_type) as string | undefined,
          activityType: p.activity_type as string | undefined,
          status: 'suggested',
          location: {
            city: (p.location_name || p.city) as string | undefined,
            country: p.country as string | undefined,
          },
          details: {
            ...(p.cost !== undefined ? { cost: { amount: p.cost as number, currency: tripContext.currency || '' } } : {}),
            ...(p.notes ? { notes: { user_summary: p.notes as string } } : {}),
          },
          sourceRefs: { email_ids: [], recommendation_ids: [] },
          isCancelled: false,
          isPaid: false,
        } as Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>)
      ));

    } else if (tc.name === 'add_place' && tc.args?.name) {
      if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
      await addPOI({
        tripId: tripContext.tripId,
        name: tc.args.name as string,
        category: (CATEGORY_MAP[tc.args.category as string] ?? tc.args.category as PointOfInterest['category']) || 'attraction',
        placeType: (tc.args.place_type || tc.args.accommodation_type || tc.args.eatery_type || tc.args.transport_type || tc.args.event_type) as string | undefined,
        activityType: tc.args.activity_type as string | undefined,
        status: 'suggested',
        location: {
          city: (tc.args.location_name || tc.args.city) as string | undefined,
          country: tc.args.country as string | undefined,
        },
        details: {
          ...(tc.args.cost !== undefined ? { cost: { amount: tc.args.cost as number, currency: tripContext.currency || '' } } : {}),
          ...(tc.args.notes ? { notes: { user_summary: tc.args.notes as string } } : {}),
        },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        isCancelled: false,
        isPaid: false,
      } as Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>);

    } else if (tc.name === 'update_place' && (tc.args?.place_id || tc.args?.name)) {
      const existing = tc.args.place_id
        ? pois.find(p => p.id === String(tc.args.place_id))
        : pois.find(p => p.name.toLowerCase() === String(tc.args.name).toLowerCase());
      if (existing) {
        if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
        const updates: Partial<PointOfInterest> = {};
        if (tc.args.cost !== undefined || tc.args.notes !== undefined) {
          updates.details = {
            ...existing.details,
            ...(tc.args.cost !== undefined ? { cost: { amount: tc.args.cost as number, currency: tripContext.currency || '' } } : {}),
            ...(tc.args.notes !== undefined ? { notes: { ...existing.details?.notes, user_summary: tc.args.notes as string } } : {}),
          };
        }
        if (tc.args.status !== undefined) updates.status = tc.args.status as PointOfInterest['status'];
        await updatePOI(existing.id, updates);
      }

    } else if (tc.name === 'add_days' && (tc.args?.count as number) > 0) {
      if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
      await updateCurrentTrip({ numberOfDays: (tripContext.numberOfDays || 0) + (tc.args.count as number) });

    } else if (tc.name === 'shift_trip_dates' && tc.args?.new_start_date && tripContext.startDate) {
      if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
      const oldStart = new Date(tripContext.startDate);
      const newStart = new Date(tc.args.new_start_date as string);
      const deltaDays = Math.round((newStart.getTime() - oldStart.getTime()) / 86_400_000);
      const tripUpdates: { startDate: string; endDate?: string } = { startDate: tc.args.new_start_date as string };
      if (tripContext.endDate) {
        const newEnd = new Date(tripContext.endDate);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        tripUpdates.endDate = newEnd.toISOString().split('T')[0];
      }
      await updateCurrentTrip(tripUpdates);
      await Promise.all(
        itineraryDays
          .filter(d => d.date)
          .map(d => {
            const shifted = new Date(d.date!);
            shifted.setDate(shifted.getDate() + deltaDays);
            return supabase
              .from('itinerary_days')
              .update({ date: shifted.toISOString().split('T')[0] })
              .eq('id', d.id);
          }),
      );
    }
  }

  return { newDays, shouldApply };
}
