import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Bot, User, AlertCircle, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/shared/lib/utils';
import { useToast } from '@/shared/hooks/use-toast';
import { useAiUsage } from '@/shared/hooks/useAiUsage';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { usePOI } from '@/features/poi/POIContext';
import { useItineraryDraft } from '@/features/itinerary/useItineraryDraft';
import { applyDraftToTrip } from '@/features/itinerary/itineraryDraftService';
import type { TripContext } from './AIChatSheet';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_INPUT = 2000;
const COOLDOWN_MS = 2000;
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

// In-memory store for per-trip conversation sessions
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
}

export function AIChatCore({ tripContext, compact = false, className, initialMessage }: AIChatCoreProps) {
  const { t } = useTranslation();
  const tripId = tripContext.tripId;
  const [messages, setMessages] = useState<Message[]>(() =>
    tripSessions.get(tripId) || []
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [applying, setApplying] = useState(false);
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
  const { pois } = usePOI();
  const { draft, isInitialized, initFromReal, applyToolCall, clearDraft } = useItineraryDraft();

  // Initialize draft
  useEffect(() => {
    if (!isInitialized) {
      initFromReal(itineraryDays, pois);
    }
  }, [isInitialized, initFromReal, itineraryDays, pois]);

  // When trip changes, save current session and load the new one
  useEffect(() => {
    if (prevTripIdRef.current !== tripId) {
      if (prevTripIdRef.current && messages.length > 0) {
        tripSessions.set(prevTripIdRef.current, messages);
      }
      const restored = tripSessions.get(tripId) || [];
      setMessages(restored);
      setError(null);
      prevTripIdRef.current = tripId;
    }
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist session on message changes
  useEffect(() => {
    if (messages.length > 0) {
      tripSessions.set(tripId, messages);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleApplyDraft = useCallback(async () => {
    if (applying || draft.length === 0) return;
    setApplying(true);
    setError(null);

    try {
      await applyDraftToTrip(tripContext.tripId, draft, pois);
      toast({
        title: t('aiChat.tripUpdated'),
        description: t('aiChat.tripUpdatedDesc'),
      });
      initFromReal(itineraryDays, pois);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to update trip.');
    } finally {
      setApplying(false);
    }
  }, [applying, draft, pois, toast, t, initFromReal, itineraryDays, tripContext.tripId]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (Date.now() - lastSentAt < COOLDOWN_MS) return;

    setError(null);
    const userMsg: Message = { role: 'user', content: trimmed.slice(0, MAX_INPUT) };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setLastSentAt(Date.now());

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
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
          mode: 'planner',
          itineraryDraft: draft,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to get response');
      if (data?.error === 'daily_limit_exceeded') {
        queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
        throw new Error(data.message || 'Daily AI chat limit reached');
      }
      if (data?.error) throw new Error(data.error);

      // Handle tool calls (itinerary updates)
      let shouldApply = false;
      if (data?.toolCalls?.length > 0) {
        for (const tc of data.toolCalls) {
          if (tc.name === 'set_itinerary' && tc.args?.days) {
            applyToolCall(tc.args.days);
          } else if (tc.name === 'apply_itinerary') {
            shouldApply = true;
          }
        }
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: data?.message || 'Sorry, I could not generate a response.',
      };
      setMessages(prev => [...prev, assistantMsg]);
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });

      if (shouldApply && draft.length > 0) {
        handleApplyDraft();
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, lastSentAt, tripContext, draft, applyToolCall, queryClient, handleApplyDraft]);

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
          await supabase.from('source_recommendations').insert([{
            recommendation_id: jobId,
            trip_id: tripContext.tripId,
            source_title: `AI: ${meta.title || tripContext.tripName}`,
            status: 'processing',
            analysis: {},
            linked_entities: [],
          }]);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => { setMessages([]); tripSessions.delete(tripId); setError(null); }}
            disabled={loading || integrating}
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
          {messages.length === 0 && (
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

          {messages.map((msg, i) => (
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
              <div
                className={cn(
                  'rounded-2xl whitespace-pre-wrap break-words',
                  compact ? 'px-2.5 py-1.5 text-xs max-w-[90%]' : 'px-3.5 py-2.5 text-sm max-w-[85%]',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                )}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className={cn('shrink-0 rounded-full bg-muted flex items-center justify-center mt-0.5', compact ? 'w-5 h-5' : 'w-7 h-7')}>
                  <User size={compact ? 10 : 14} />
                </div>
              )}
            </div>
          ))}

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
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.slice(0, MAX_INPUT))}
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
