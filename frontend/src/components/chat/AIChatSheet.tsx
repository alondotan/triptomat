import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Bot, User, AlertCircle, Sparkles, Trash2, Map as MapIcon, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAiUsage } from '@/hooks/useAiUsage';
import { useItinerary } from '@/context/ItineraryContext';
import { usePOI } from '@/context/POIContext';
import { useItineraryDraft } from '@/hooks/useItineraryDraft';
import { DraftTreePanel } from './DraftTreePanel';
import { applyDraftToTrip } from '@/services/itineraryDraftService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface TripContext {
  tripId: string;
  tripName: string;
  countries: string[];
  startDate?: string;
  endDate?: string;
  numberOfDays?: number;
  status: string;
  currency: string;
  locations: string[];
}

interface AIChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripContext: TripContext | null;
  /** Pre-fill the input with this message when the chat opens */
  initialMessage?: string;
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

export function AIChatSheet({ open, onOpenChange, tripContext, initialMessage }: AIChatSheetProps) {
  const { t } = useTranslation();
  const tripId = tripContext?.tripId || null;
  const [messages, setMessages] = useState<Message[]>(() =>
    tripId ? (tripSessions.get(tripId) || []) : []
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [mobileTab, setMobileTab] = useState<'chat' | 'plan'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevTripIdRef = useRef<string | null>(tripId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: aiUsage } = useAiUsage();
  const chatUsage = aiUsage?.tier !== 'super' ? aiUsage?.features?.ai_chat : null;
  const chatLimitReached = chatUsage ? chatUsage.used >= chatUsage.limit : false;

  // Itinerary + POI contexts for seeding draft
  const { itineraryDays } = useItinerary();
  const { pois } = usePOI();

  // Draft state
  const { draft, isDirty, isInitialized, initFromReal, applyToolCall, clearDraft } = useItineraryDraft();

  // Initialize draft when sheet opens or trip changes
  useEffect(() => {
    if (open && tripContext && !isInitialized) {
      initFromReal(itineraryDays, pois);
    }
  }, [open, tripContext, isInitialized, initFromReal, itineraryDays, pois]);

  // When trip changes, save current session and load the new one
  useEffect(() => {
    if (prevTripIdRef.current !== tripId) {
      if (prevTripIdRef.current && messages.length > 0) {
        tripSessions.set(prevTripIdRef.current, messages);
      }
      const restored = tripId ? (tripSessions.get(tripId) || []) : [];
      setMessages(restored);
      setError(null);
      prevTripIdRef.current = tripId;
    }
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist session on message changes
  useEffect(() => {
    if (tripId && messages.length > 0) {
      tripSessions.set(tripId, messages);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill input when initialMessage is provided
  useEffect(() => {
    if (initialMessage) {
      setInput(initialMessage);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [initialMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when sheet opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !tripContext) return;

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
            setMobileTab('plan');
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

      // Apply itinerary to trip if AI called apply_itinerary
      if (shouldApply && tripContext && draft.length > 0) {
        handleApplyDraft();
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, lastSentAt, tripContext, draft, applyToolCall, queryClient]);

  const handleIntegrateInsights = useCallback(async () => {
    if (!tripContext || loading || integrating) return;

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
        if (jobId && tripContext.tripId) {
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
  }, [tripContext, loading, integrating, messages, toast]);

  const handleApplyDraft = useCallback(async () => {
    if (!tripContext || applying || draft.length === 0) return;
    setApplying(true);
    setError(null);

    try {
      await applyDraftToTrip(tripContext.tripId, draft, pois);
      toast({
        title: t('aiChat.tripUpdated'),
        description: t('aiChat.tripUpdatedDesc'),
      });
      // Re-initialize draft from real data (will happen via context refresh)
      initFromReal(itineraryDays, pois);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to update trip.');
    } finally {
      setApplying(false);
    }
  }, [tripContext, applying, draft, pois, toast, t, initFromReal, itineraryDays]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const tripLabel = tripContext?.tripName || 'Trip';
  const hasAssistantMessages = messages.some(m => m.role === 'assistant');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[780px] sm:max-w-[780px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between pr-6">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot size={18} className="text-primary" />
              <span className="truncate">{t('aiChat.title', { trip: tripLabel })}</span>
            </SheetTitle>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => { setMessages([]); if (tripId) tripSessions.delete(tripId); setError(null); }}
                  disabled={loading || integrating}
                  title={t('aiChat.clearChat')}
                >
                  <Trash2 size={14} />
                </Button>
              )}
              {hasAssistantMessages && tripContext && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs h-7"
                  onClick={handleIntegrateInsights}
                  disabled={loading || integrating}
                >
                  {integrating
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Sparkles size={12} />}
                  {t('aiChat.integrate')}
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Mobile tab bar */}
        <div className="sm:hidden flex border-b border-border shrink-0">
          <button
            onClick={() => setMobileTab('chat')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              mobileTab === 'chat' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
            )}
          >
            <MessageSquare size={14} /> {t('aiChat.chatTab')}
          </button>
          <button
            onClick={() => setMobileTab('plan')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              mobileTab === 'plan' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
            )}
          >
            <MapIcon size={14} /> {t('aiChat.planTab')}
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Draft tree panel — left side on desktop, tab on mobile */}
          <div className={cn(
            'w-[300px] border-e border-border flex-col bg-muted/20',
            mobileTab === 'plan' ? 'flex' : 'hidden sm:flex'
          )}>
            <DraftTreePanel
              draft={draft}
              applying={applying}
              onClear={clearDraft}
            />
          </div>

          {/* Chat panel — right side on desktop, tab on mobile */}
          <div className={cn(
            'flex-1 flex flex-col min-w-0',
            mobileTab === 'chat' ? 'flex' : 'hidden sm:flex'
          )}>
            {/* Messages area */}
            <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
              <div className="px-4 py-4 space-y-4">
                {messages.length === 0 && tripContext && (
                  <div className="text-center text-muted-foreground text-sm py-12 space-y-2">
                    <Bot size={32} className="mx-auto text-muted-foreground/50" />
                    <p className="font-medium">{t('aiChat.greeting', { trip: tripLabel })}</p>
                    <p className="text-xs">
                      {tripContext.countries.length > 0
                        ? t('aiChat.promptWithCountries', { countries: tripContext.countries.join(', ') })
                        : t('aiChat.promptGeneric')}
                    </p>
                  </div>
                )}

                {!tripContext && (
                  <div className="text-center text-muted-foreground text-sm py-12 space-y-2">
                    <Bot size={32} className="mx-auto text-muted-foreground/50" />
                    <p className="font-medium">{t('aiChat.noTripSelected')}</p>
                    <p className="text-xs">{t('aiChat.selectTripFirst')}</p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex gap-2.5',
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                        <Bot size={14} className="text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap break-words',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                      )}
                    >
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5">
                        <User size={14} />
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                      <Bot size={14} className="text-primary" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Error banner */}
            {error && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Input area */}
            <div className="shrink-0 border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value.slice(0, MAX_INPUT))}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-h-[120px] min-h-[40px]"
                  style={{ height: 'auto', overflow: 'auto' }}
                  onInput={e => {
                    const t = e.currentTarget;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                  }}
                  disabled={loading || !tripContext || chatLimitReached}
                  placeholder={chatLimitReached ? t('aiChat.limitReached', 'Daily AI chat limit reached') : tripContext ? t('aiChat.inputPlaceholder', { trip: tripLabel }) : t('aiChat.inputDisabled')}
                />
                <Button
                  size="icon"
                  className="shrink-0 rounded-xl h-10 w-10"
                  onClick={sendMessage}
                  disabled={!input.trim() || loading || !tripContext || chatLimitReached}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-1.5 px-1">
                <p className="text-[10px] text-muted-foreground">
                  {t('aiChat.disclaimer')}
                </p>
                {chatUsage && (
                  <p className={cn(
                    "text-[10px]",
                    chatLimitReached ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    {chatUsage.used}/{chatUsage.limit}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
