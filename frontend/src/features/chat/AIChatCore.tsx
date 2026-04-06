import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Bot, User, AlertCircle, Sparkles, Trash2, Undo2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createSourceRecommendation } from '@/features/inbox/recommendationService';
import { cn } from '@/shared/lib/utils';
import { useToast } from '@/shared/hooks/use-toast';
import { useAiUsage } from '@/shared/hooks/useAiUsage';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { usePOI } from '@/features/poi/POIContext';
import { updatePOI as updatePOIService } from '@/features/poi/poiService';
import { useItineraryDraft } from '@/features/itinerary/useItineraryDraft';
import { CATEGORY_MAP } from '@/shared/utils/categoryMap';
import { applyDraftToTrip } from '@/features/itinerary/itineraryDraftService';
import { useItineraryHistory } from '@/features/home/useItineraryHistory';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { useChatHistory } from './useChatHistory';
import { useAtMention, extractMentionNames, stripMentionBrackets } from './useAtMention';
import { AtMentionMenu } from './AtMentionMenu';
import type { TripContext } from './AIChatSheet';
import type { PointOfInterest } from '@/types/trip';

type Message = import('./useChatHistory').Message;

const MAX_INPUT = 2000;
const COOLDOWN_MS = 2000;
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

// In-memory store for per-trip conversation sessions (L1 cache for instant re-render)
const tripSessions = new Map<string, Message[]>();

const SUMMARIZE_PROMPT = `First, summarize what the user ultimately asked for in this conversation — consider only their final preferences (if the user changed their mind or rejected earlier suggestions, ignore those). Then list ONLY the specific place names that match what the user actually wanted. Reply in the SAME LANGUAGE the user used.

IMPORTANT: Do NOT put types in parentheses after the place name. Just the name.

If the conversation is about planning a multi-day route or itinerary, group the places by day and include the city/area for each day:

Day 1 — Tokyo, Asakusa:
- Senso-ji Temple
- Nakamise Shopping Street
- Tsukiji Outer Market
Day 2 — Tokyo, Shibuya & Harajuku:
- Meiji Shrine
- Takeshita Street
- Shibuya Crossing

If the conversation is NOT about a multi-day plan (just general recommendations), use a flat list:

- Casco Viejo
- Mercado de Mariscos
- BioMuseo

In both cases, start with Line 1: A short summary of what the user wanted (e.g. "The user asked for a 3-day itinerary in Tokyo" or "The user asked for romantic restaurants in Tel Aviv"), then an empty line, then the places.
No descriptions, no tips, no extra text — just the summary line and the place names (grouped by day if applicable).`;

interface AIChatCoreProps {
  tripContext: TripContext;
  /** Compact mode for embedded panels — smaller text, less padding */
  compact?: boolean;
  className?: string;
  /** Pre-fill the input with this message when the chat opens */
  initialMessage?: string;
  /** Called after every new assistant message (message text + its index in the conversation) */
  onNewAssistantMessage?: (message: string, messageIndex: number) => void;
  /** Called when set_itinerary fires — receives the clean, structured place list from the tool call + the assistant message index */
  onItineraryUpdate?: (places: Array<{ name: string; day: number; location?: string }>, messageIndex: number) => void;
  /** Called when suggest_places fires — receives recommended places to show on map / suggestions panel */
  onSuggestPlaces?: (places: Array<{ name: string; category: string; place_type?: string; activity_type?: string; accommodation_type?: string; eatery_type?: string; transport_type?: string; event_type?: string; location_id?: string; location_name?: string; city?: string; country?: string; why?: string }>, messageIndex: number) => void;
  /**
   * When true: set_itinerary is applied to the real trip immediately (no draft/apply step).
   * Shows undo-per-step and restore-to-pre-conversation buttons.
   */
  instantApply?: boolean;
  /** Called when user clicks a snapshot link in a message — receives the DraftDay[] from that tool call */
  onViewSnapshot?: (days: import('@/types/itineraryDraft').DraftDay[]) => void;
}

export function AIChatCore({ tripContext, compact = false, className, initialMessage, onNewAssistantMessage, onItineraryUpdate, onSuggestPlaces, instantApply = false, onViewSnapshot }: AIChatCoreProps) {
  const { t } = useTranslation();
  const tripId = tripContext.tripId;

  // DB-backed chat history (with localStorage migration on first load)
  const { messages: dbMessages, isLoading: historyIsLoading, appendMessages, clearHistory } = useChatHistory(tripId);

  // Local messages state — initialized from in-memory cache (L1), synced from DB on load
  const [messages, setMessages] = useState<Message[]>(() => tripSessions.get(tripId) ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevTripIdRef = useRef<string>(tripId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: aiUsage } = useAiUsage();
  const chatUsage = aiUsage?.tier !== 'super' ? aiUsage?.features?.ai_chat : null;
  const chatLimitReached = chatUsage ? chatUsage.used >= chatUsage.limit : false;

  const { itineraryDays } = useItinerary();
  const { pois, addPOI } = usePOI();
  const { draft, isInitialized, initFromReal, applyToolCall } = useItineraryDraft();
  const history = useItineraryHistory();
  const { activeTrip, updateCurrentTrip, tripPlaces, tripLocations } = useActiveTrip();
  const [historyLoading, setHistoryLoading] = useState(false);
  const mention = useAtMention();
  // In-memory map: assistant message index → itinerary snapshot (not persisted)
  const snapshotByMsgIdxRef = useRef<Map<number, import('@/types/itineraryDraft').DraftDay[]>>(new Map());

  // Initialize draft
  useEffect(() => {
    if (!isInitialized) {
      initFromReal(itineraryDays, pois);
    }
  }, [isInitialized, initFromReal, itineraryDays, pois]);

  // When DB messages load (or trip changes), seed local state from DB (if local cache is empty)
  useEffect(() => {
    if (!historyIsLoading && dbMessages.length > 0) {
      const cached = tripSessions.get(tripId);
      if (!cached || cached.length === 0) {
        tripSessions.set(tripId, dbMessages);
        setMessages(dbMessages);
      }
    }
  }, [historyIsLoading, dbMessages, tripId]);

  // When trip changes, save current session to in-memory cache and reset for new trip
  useEffect(() => {
    if (prevTripIdRef.current !== tripId) {
      if (prevTripIdRef.current && messages.length > 0) {
        tripSessions.set(prevTripIdRef.current, messages);
      }
      const restored = tripSessions.get(tripId) ?? [];
      setMessages(restored);
      setError(null);
      prevTripIdRef.current = tripId;
    }
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep in-memory cache in sync on every message change
  useEffect(() => {
    if (messages.length > 0) {
      tripSessions.set(tripId, messages);
    }
  }, [messages, tripId]);

  // Pre-fill input when initialMessage is provided
  useEffect(() => {
    if (initialMessage) {
      setInput(initialMessage);
      // Focus the input after a tick so the sheet is visible
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [initialMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (Date.now() - lastSentAt < COOLDOWN_MS) return;

    setError(null);

    // In instant-apply mode, take a backup before the very first message of the conversation
    if (instantApply && messages.length === 0) {
      history.takeBackup(itineraryDays, pois, activeTrip);
    }

    // Display content: strip @[Name] brackets → @Name (clean for the user to read)
    const displayContent = stripMentionBrackets(trimmed);
    // AI content: append mention IDs so the model can cross-reference tripPlan
    const mentionNames = extractMentionNames(trimmed);
    const contextLines = mentionNames.length > 0 ? mention.getMentionContextLines(mentionNames) : [];
    const aiContent = contextLines.length > 0
      ? `${displayContent}\n\n[mentioned: ${contextLines.join(', ')}]`
      : displayContent;
    const userMsg: Message = { role: 'user', content: displayContent.slice(0, MAX_INPUT) };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setLastSentAt(Date.now());

    // Build the trip plan sent as context: locations → days (scheduled) + potential POIs
    const tripPlan = (() => {
      const poiMap = new Map(pois.map(p => [p.id, p]));

      // Collect scheduled POI IDs across all days
      const scheduledPoiIds = new Set(
        itineraryDays.flatMap(d =>
          (d.activities ?? []).filter(a => a.type === 'poi').map(a => a.id)
        )
      );

      // Build tripPlace → location name lookup
      const placeLocMap = new Map(
        tripPlaces.map(tp => {
          const loc = tripLocations.find(l => l.id === tp.tripLocationId);
          return [tp.id, loc?.name ?? ''];
        })
      );

      // Group days by location name (via tripPlaceId → location name)
      const locationDaysMap = new Map<string, typeof itineraryDays>();
      for (const day of itineraryDays) {
        const loc = (day.tripPlaceId && placeLocMap.get(day.tripPlaceId)) || '';
        if (!locationDaysMap.has(loc)) locationDaysMap.set(loc, []);
        locationDaysMap.get(loc)!.push(day);
      }

      // Build name → TripLocation lookup for IDs
      const tripLocationByName = new Map(
        tripLocations.map(tl => [tl.name.toLowerCase(), tl])
      );

      // Group unscheduled POIs by city
      const potentialByCity = new Map<string, Array<{ id: string; name: string; category: string; status: string }>>();
      const unassigned: Array<{ id: string; name: string; category: string; status: string }> = [];
      for (const poi of pois) {
        if (scheduledPoiIds.has(poi.id)) continue;
        const city = poi.location?.city || '';
        if (!city) {
          unassigned.push({ id: poi.id, name: poi.name, category: poi.category, status: poi.status });
          continue;
        }
        if (!potentialByCity.has(city)) potentialByCity.set(city, []);
        potentialByCity.get(city)!.push({ id: poi.id, name: poi.name, category: poi.category, status: poi.status });
      }

      // Build hotel list from accommodation POIs
      const hotels = pois
        .filter(p => p.category === 'accommodation')
        .map(p => ({ id: p.id, name: p.name, city: p.location?.city }));

      // Build location entries for locations that have scheduled days
      const locations = [...locationDaysMap.entries()].map(([locName, days]) => ({
        id: tripLocationByName.get(locName.toLowerCase())?.id,
        name: locName,
        days: days.map(day => {
          const selectedHotel = (day.accommodationOptions ?? []).find(a => a.is_selected);
          const hotelPoi = selectedHotel ? poiMap.get(selectedHotel.poi_id) : undefined;
          return {
            dayNumber: day.dayNumber,
            date: day.date,
            hotel_id: hotelPoi?.id,
            places: (day.activities ?? [])
              .filter(a => a.type === 'poi' && poiMap.has(a.id))
              .sort((a, b) => a.order - b.order)
              .map(a => {
                const poi = poiMap.get(a.id)!;
                return { id: poi.id, name: poi.name, category: poi.category, time: a.time_window?.start };
              }),
          };
        }),
        potential: potentialByCity.get(locName) ?? [],
      }));

      // Add cities that have potential POIs but no scheduled days
      for (const [city, potentials] of potentialByCity.entries()) {
        if (!locationDaysMap.has(city)) {
          locations.push({ id: tripLocationByName.get(city.toLowerCase())?.id, name: city, days: [], potential: potentials });
        }
      }

      return {
        locations,
        unassigned: unassigned.length ? unassigned : undefined,
        hotels: hotels.length ? hotels : undefined,
      };
    })();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: updatedMessages.map((m, i) => ({
            role: m.role,
            // Last message is the one just sent — use enriched AI content with mention IDs
            content: i === updatedMessages.length - 1 && m.role === 'user' ? aiContent.slice(0, MAX_INPUT) : m.content,
          })),
          tripContext: {
            tripName: tripContext.tripName,
            countries: tripContext.countries,
            startDate: tripContext.startDate,
            endDate: tripContext.endDate,
            numberOfDays: tripContext.numberOfDays,
            status: tripContext.status,
            currency: tripContext.currency,
            festivals: tripContext.festivals,
            locationsFlat: tripContext.locationsFlat,
            allPlaces: tripContext.allPlaces,
          },
          mode: 'planner',
          tripPlan,
          instantApply,
        },
      });

      console.log('[ai-chat] data:', JSON.stringify(data)?.slice(0, 500), 'error:', fnError);
      if (fnError) {
        let errorMsg = fnError.message || 'Failed to get response';
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx) {
            const body = await ctx.json();
            console.error('[ai-chat] fnError body:', body);
            errorMsg = body?.error || body?.message || errorMsg;
          }
        } catch { /* ignore */ }
        throw new Error(errorMsg);
      }
      if (data?.error === 'daily_limit_exceeded') {
        queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
        throw new Error(data.message || 'Daily AI chat limit reached');
      }
      if (data?.error) throw new Error(data.error);

      // Handle tool calls (itinerary updates)
      let shouldApply = false;
      let newDays: ReturnType<typeof applyToolCall> | null = null;
      if (data?.toolCalls?.length > 0) {
        for (const tc of data.toolCalls) {
          if (tc.name === 'set_itinerary' && tc.args?.days) {
            if (instantApply) {
              history.pushHistory(itineraryDays, pois, activeTrip);
            }
            newDays = applyToolCall(tc.args.days);
            // Save snapshot so the user can revisit this plan state later
            if (newDays) {
              snapshotByMsgIdxRef.current.set(updatedMessages.length, newDays);
            }
            // Notify parent with clean structured places from the tool call
            if (onItineraryUpdate) {
              const places = (tc.args.days as Array<{ day_number?: number; dayNumber?: number; location_id?: string; location_name?: string; location_context?: string; locationContext?: string; places?: Array<{ name?: string; place_name?: string; is_specific_place?: boolean; place_id?: string }> }>)
                .flatMap(d => (d.places ?? [])
                  .filter(p => p.place_id || p.is_specific_place !== false)
                  .map(p => ({
                    name: p.place_name ?? p.name ?? '',
                    day: d.day_number ?? d.dayNumber ?? 0,
                    location: d.location_name ?? d.location_context ?? d.locationContext,
                  }))
                  .filter(p => p.name));
              onItineraryUpdate(places, updatedMessages.length);
            }
          } else if (tc.name === 'apply_itinerary') {
            shouldApply = true;

          } else if (tc.name === 'suggest_places' && tc.args?.places) {
            onSuggestPlaces?.(tc.args.places, updatedMessages.length);

          } else if (tc.name === 'add_place' && tc.args?.name) {
            if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
            await addPOI({
              tripId: tripContext.tripId,
              name: tc.args.name,
              category: (CATEGORY_MAP[tc.args.category as string] ?? tc.args.category as PointOfInterest['category']) || 'attraction',
              placeType: (tc.args.place_type || tc.args.accommodation_type || tc.args.eatery_type || tc.args.transport_type || tc.args.event_type) as string | undefined,
              activityType: tc.args.activity_type as string | undefined,
              status: 'suggested',
              location: {
                city: (tc.args.location_name || tc.args.city) as string | undefined,
                country: tc.args.country as string | undefined,
              },
              details: {
                ...(tc.args.cost !== undefined ? { cost: { amount: tc.args.cost, currency: tripContext.currency || '' } } : {}),
                ...(tc.args.notes ? { notes: { user_summary: tc.args.notes } } : {}),
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
              if (tc.args.status !== undefined) {
                updates.status = tc.args.status as PointOfInterest['status'];
              }
              await updatePOIService(existing.id, updates);
            }

          } else if (tc.name === 'add_days' && (tc.args?.count as number) > 0) {
            if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
            await updateCurrentTrip({ numberOfDays: (tripContext.numberOfDays || 0) + (tc.args.count as number) });

          } else if (tc.name === 'shift_trip_dates' && tc.args?.new_start_date && tripContext.startDate) {
            if (instantApply) history.pushHistory(itineraryDays, pois, activeTrip);
            const oldStart = new Date(tripContext.startDate);
            const newStart = new Date(tc.args.new_start_date as string);
            const deltaDays = Math.round((newStart.getTime() - oldStart.getTime()) / 86_400_000);
            const tripUpdates: Parameters<typeof updateCurrentTrip>[0] = { startDate: tc.args.new_start_date as string };
            if (tripContext.endDate) {
              const newEnd = new Date(tripContext.endDate);
              newEnd.setDate(newEnd.getDate() + deltaDays);
              tripUpdates.endDate = newEnd.toISOString().split('T')[0];
            }
            await updateCurrentTrip(tripUpdates);
            // Shift dates on all itinerary days that have an assigned date
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
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: data?.message || 'Sorry, I could not generate a response.',
      };
      setMessages(prev => {
        const next = [...prev, assistantMsg];
        onNewAssistantMessage?.(assistantMsg.content, next.length - 1);
        return next;
      });
      // Persist both messages to DB (fire-and-forget — don't block UI)
      appendMessages([userMsg, assistantMsg]).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });

      // Apply the itinerary to the real trip
      const daysToApply = newDays ?? (shouldApply ? draft : null);
      console.log('[ai-chat] daysToApply:', daysToApply?.length, 'newDays:', !!newDays, 'shouldApply:', shouldApply, 'instantApply:', instantApply);
      if (daysToApply && daysToApply.length > 0 && (instantApply ? !!newDays : shouldApply)) {
        try {
          console.log('[ai-chat] calling applyDraftToTrip with', JSON.stringify(daysToApply).slice(0, 500));
          await applyDraftToTrip(tripContext.tripId, daysToApply, pois, tripPlaces, tripContext.countries?.[0]);
          if (!instantApply) {
            toast({ title: t('aiChat.tripUpdated'), description: t('aiChat.tripUpdatedDesc') });
          }
          initFromReal(itineraryDays, pois);
          // Sync trip metadata so Schedule page (useTripDays) sees the right day count
          const maxDay = daysToApply.reduce((m, d) => Math.max(m, d.dayNumber || 0), 0);
          if (maxDay > 0) {
            const updates: Parameters<typeof updateCurrentTrip>[0] = {};
            if (maxDay > (tripContext.numberOfDays || 0)) updates.numberOfDays = maxDay;
            if (tripContext.status === 'research') updates.status = 'planning';
            if (Object.keys(updates).length > 0) {
              updateCurrentTrip(updates).catch(() => {});
            }
          }
        } catch (err: unknown) {
          console.error('[ai-chat] applyDraftToTrip error:', err);
          setError((err as Error).message || 'Failed to update trip.');
        }
      }
    } catch (err: unknown) {
      // Try to read the actual error body from FunctionsHttpError.context
      let errMsg = (err as Error).message || 'Something went wrong. Please try again.';
      try {
        const ctx = (err as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json();
          errMsg = body?.error || errMsg;
        }
      } catch { /* ignore parse errors */ }
      console.error('[ai-chat] outer error:', errMsg, err);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, lastSentAt, tripContext, draft, applyToolCall, queryClient, onNewAssistantMessage, onSuggestPlaces, pois, itineraryDays, toast, t, initFromReal, instantApply, history, addPOI, activeTrip, updateCurrentTrip, tripPlaces, appendMessages]);

  // Undo last AI change (instant-apply mode)
  const handleUndo = useCallback(async () => {
    const snapshot = history.undo();
    if (!snapshot) return;
    setHistoryLoading(true);
    setError(null);
    try {
      await applyDraftToTrip(tripContext.tripId, snapshot.days, pois, tripPlaces);
      const { numberOfDays, startDate, endDate } = snapshot.tripMeta;
      if (numberOfDays !== undefined || startDate !== undefined || endDate !== undefined) {
        await updateCurrentTrip({ ...(numberOfDays !== undefined ? { numberOfDays } : {}), ...(startDate !== undefined ? { startDate } : {}), ...(endDate !== undefined ? { endDate } : {}) });
      }
      initFromReal(itineraryDays, pois);
    } catch (err: unknown) {
      setError((err as Error).message || 'Undo failed.');
    } finally {
      setHistoryLoading(false);
    }
  }, [history, tripContext.tripId, pois, itineraryDays, initFromReal, updateCurrentTrip, tripPlaces]);

  // Restore to pre-conversation state (instant-apply mode)
  const handleRestore = useCallback(async () => {
    const snapshot = history.restore();
    if (!snapshot) return;
    setHistoryLoading(true);
    setError(null);
    try {
      await applyDraftToTrip(tripContext.tripId, snapshot.days, pois, tripPlaces);
      const { numberOfDays, startDate, endDate } = snapshot.tripMeta;
      if (numberOfDays !== undefined || startDate !== undefined || endDate !== undefined) {
        await updateCurrentTrip({ ...(numberOfDays !== undefined ? { numberOfDays } : {}), ...(startDate !== undefined ? { startDate } : {}), ...(endDate !== undefined ? { endDate } : {}) });
      }
      initFromReal(itineraryDays, pois);
    } catch (err: unknown) {
      setError((err as Error).message || 'Restore failed.');
    } finally {
      setHistoryLoading(false);
    }
  }, [history, tripContext.tripId, pois, itineraryDays, initFromReal, updateCurrentTrip, tripPlaces]);

  const handleIntegrateInsights = useCallback(async () => {
    if (loading || integrating) return;

    const hasAssistantMessages = messages.some(m => m.role === 'assistant');
    if (!hasAssistantMessages) return;

    setIntegrating(true);
    setError(null);

    try {
      const summaryMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: SUMMARIZE_PROMPT },
      ];

      const { data, error: fnError } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: summaryMessages,
          tripContext: {
            tripName: tripContext.tripName,
            countries: tripContext.countries,
            startDate: tripContext.startDate,
            endDate: tripContext.endDate,
            numberOfDays: tripContext.numberOfDays,
            status: tripContext.status,
            currency: tripContext.currency,
            locations: tripContext.locations,
          },
        },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to generate summary');
      if (data?.error) throw new Error(data.error);

      const summaryText = data?.message;
      if (!summaryText) throw new Error('No summary generated');

      const { data: tokenData } = await supabase
        .from('webhook_tokens')
        .select('token')
        .single();

      if (!tokenData?.token) throw new Error('No webhook token found');

      const prefixedText = `[AI Chat Insights — ${tripContext.tripName}]\n\n${summaryText}`;

      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prefixedText, webhook_token: tokenData.token }),
      });

      const gatewayData = await res.json();

      if (res.status === 202) {
        const jobId = gatewayData.job_id;
        const meta = gatewayData.source_metadata || {};
        if (jobId) {
          await createSourceRecommendation({
            recommendation_id: jobId,
            trip_id: tripContext.tripId,
            source_title: `AI: ${meta.title || tripContext.tripName}`,
            status: 'processing',
            analysis: {},
            linked_entities: [],
          });
        }

        const confirmationMsg: Message = {
          role: 'assistant',
          content: `${t('aiChat.integrationConfirmation')}\n\n${summaryText}`,
        };
        setMessages(prev => [...prev, confirmationMsg]);

        toast({
          title: t('aiChat.insightsSent'),
          description: t('aiChat.insightsDescription'),
        });
      } else {
        throw new Error(gatewayData.error || 'Gateway rejected the request');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to integrate insights.');
    } finally {
      setIntegrating(false);
    }
  }, [loading, integrating, messages, toast, tripContext, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.isOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mention.navigateDown(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); mention.navigateUp();   return; }
      if (e.key === 'Escape')    { e.preventDefault(); mention.close();         return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selected = mention.filtered[mention.selectedIndex];
        if (selected) {
          const ta = e.currentTarget;
          const cursor = ta.selectionStart ?? input.length;
          const { newInput, newCursor } = mention.selectItem(selected, input, cursor);
          setInput(newInput);
          // Restore cursor after React re-render
          requestAnimationFrame(() => {
            ta.setSelectionRange(newCursor, newCursor);
            // Resize
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, compact ? 80 : 120) + 'px';
          });
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const tripLabel = tripContext.tripName || 'Trip';
  const hasAssistantMessages = messages.some(m => m.role === 'assistant');

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Bot size={compact ? 14 : 16} className="text-primary shrink-0" />
        <span className={cn('font-medium truncate flex-1', compact ? 'text-xs' : 'text-sm')}>
          {t('aiChat.title', { trip: tripLabel })}
        </span>
        {/* Instant-apply: undo / restore buttons */}
        {instantApply && history.canUndo && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleUndo}
            disabled={loading || historyLoading}
            title="Undo last change"
          >
            {historyLoading ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
          </Button>
        )}
        {instantApply && history.canRestore && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={handleRestore}
            disabled={loading || historyLoading}
            title="Restore to before this conversation"
          >
            {historyLoading ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
            {!compact && 'Restore'}
          </Button>
        )}
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setMessages([]);
              tripSessions.delete(tripId);
              clearHistory().catch(() => {});
              if (instantApply) history.reset();
              setError(null);
            }}
            disabled={loading || integrating || historyLoading}
            title={t('aiChat.clearChat')}
          >
            <Trash2 size={12} />
          </Button>
        )}
        {hasAssistantMessages && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1 text-[10px] h-6 px-2"
            onClick={handleIntegrateInsights}
            disabled={loading || integrating}
          >
            {integrating
              ? <Loader2 size={10} className="animate-spin" />
              : <Sparkles size={10} />}
            {t('aiChat.integrate')}
          </Button>
        )}
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className={cn('space-y-3', compact ? 'px-3 py-3' : 'px-4 py-4')}>
          {historyIsLoading && messages.length === 0 && (
            <div className="flex justify-center py-8">
              <Loader2 size={compact ? 16 : 20} className="animate-spin text-muted-foreground/50" />
            </div>
          )}
          {!historyIsLoading && messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8 space-y-1.5">
              <Bot size={compact ? 24 : 32} className="mx-auto text-muted-foreground/50" />
              <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
                {t('aiChat.greeting', { trip: tripLabel })}
              </p>
              <p className="text-[10px]">
                {tripContext.countries.length > 0
                  ? t('aiChat.promptWithCountries', { countries: tripContext.countries.join(', ') })
                  : t('aiChat.promptGeneric')}
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const snap = msg.role === 'assistant' ? snapshotByMsgIdxRef.current.get(i) : undefined;
            return (
              <div
                key={i}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className={cn('shrink-0 rounded-full bg-primary/10 flex items-center justify-center mt-0.5', compact ? 'w-5 h-5' : 'w-7 h-7')}>
                    <Bot size={compact ? 10 : 14} className="text-primary" />
                  </div>
                )}
                <div className={cn('flex flex-col gap-1', compact ? 'max-w-[90%]' : 'max-w-[85%]')}>
                  <div
                    className={cn(
                      'rounded-2xl whitespace-pre-wrap break-words',
                      compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2.5 text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md'
                    )}
                  >
                    {msg.content}
                  </div>
                  {snap && onViewSnapshot && (
                    <button
                      onClick={() => onViewSnapshot(snap)}
                      className="self-start text-[10px] text-primary underline underline-offset-2 hover:text-primary/80 px-1"
                    >
                      View plan snapshot
                    </button>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className={cn('shrink-0 rounded-full bg-muted flex items-center justify-center mt-0.5', compact ? 'w-5 h-5' : 'w-7 h-7')}>
                    <User size={compact ? 10 : 14} />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2 justify-start">
              <div className={cn('shrink-0 rounded-full bg-primary/10 flex items-center justify-center mt-0.5', compact ? 'w-5 h-5' : 'w-7 h-7')}>
                <Bot size={compact ? 10 : 14} className="text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mb-1 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <AlertCircle size={12} className="shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t p-2">
        <div className="relative flex items-end gap-1.5">
          {mention.isOpen && (
            <AtMentionMenu
              items={mention.filtered}
              selectedIndex={mention.selectedIndex}
              onSelect={item => {
                const ta = inputRef.current;
                const cursor = ta?.selectionStart ?? input.length;
                const { newInput, newCursor } = mention.selectItem(item, input, cursor);
                setInput(newInput);
                requestAnimationFrame(() => {
                  if (ta) {
                    ta.focus();
                    ta.setSelectionRange(newCursor, newCursor);
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, compact ? 80 : 120) + 'px';
                  }
                });
              }}
            />
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              const val = e.target.value.slice(0, MAX_INPUT);
              setInput(val);
              mention.onInputChange(val, e.target.selectionStart ?? val.length);
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-xl border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              compact ? 'px-2.5 py-1.5 text-xs max-h-[80px] min-h-[32px]' : 'px-3.5 py-2.5 text-sm max-h-[120px] min-h-[40px]'
            )}
            style={{ height: 'auto', overflow: 'auto' }}
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, compact ? 80 : 120) + 'px';
            }}
            disabled={loading || chatLimitReached}
            placeholder={chatLimitReached ? t('aiChat.limitReached', 'Daily AI chat limit reached') : t('aiChat.inputPlaceholder', { trip: tripLabel })}
          />
          <Button
            size="icon"
            className={cn('shrink-0 rounded-xl', compact ? 'h-8 w-8' : 'h-10 w-10')}
            onClick={sendMessage}
            disabled={!input.trim() || loading || chatLimitReached}
          >
            {loading ? <Loader2 size={compact ? 12 : 16} className="animate-spin" /> : <Send size={compact ? 12 : 16} />}
          </Button>
        </div>
        {chatUsage && (
          <p className={cn(
            "text-[10px] text-end mt-1 px-1",
            chatLimitReached ? "text-destructive font-medium" : "text-muted-foreground"
          )}>
            {chatUsage.used}/{chatUsage.limit}
          </p>
        )}
      </div>
    </div>
  );
}
