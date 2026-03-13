import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Bot, User, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
}

const MAX_INPUT = 2000;
const COOLDOWN_MS = 2000;
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

// In-memory store for per-trip conversation sessions
const tripSessions = new Map<string, Message[]>();

const SUMMARIZE_PROMPT = `Based on our conversation, please create a concise summary of all the specific travel recommendations, places, restaurants, activities, and tips you mentioned. Format it as a clear list with location names, what they are, and why they're recommended. Include addresses or areas if you mentioned them. Write it as a travel recommendation text that someone could use to plan their trip.`;

export function AIChatSheet({ open, onOpenChange, tripContext }: AIChatSheetProps) {
  const { t } = useTranslation();
  const tripId = tripContext?.tripId || null;
  const [messages, setMessages] = useState<Message[]>(() =>
    tripId ? (tripSessions.get(tripId) || []) : []
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevTripIdRef = useRef<string | null>(tripId);
  const { toast } = useToast();

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
  }, [tripId, messages]);

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
        },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to get response');
      if (data?.error) throw new Error(data.error);

      const assistantMsg: Message = {
        role: 'assistant',
        content: data?.message || 'Sorry, I could not generate a response.',
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, lastSentAt, tripContext]);

  const handleIntegrateInsights = useCallback(async () => {
    if (!tripContext || loading || integrating) return;

    const hasAssistantMessages = messages.some(m => m.role === 'assistant');
    if (!hasAssistantMessages) return;

    setIntegrating(true);
    setError(null);

    try {
      // Step 1: Ask AI to summarize the conversation as recommendations
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

      // Step 2: Get webhook token
      const { data: tokenData } = await supabase
        .from('webhook_tokens')
        .select('token')
        .single();

      if (!tokenData?.token) throw new Error('No webhook token found');

      // Step 3: Send summary to gateway (same as TextSubmit)
      const prefixedText = `[AI Chat Insights — ${tripContext.tripName}]\n\n${summaryText}`;

      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prefixedText, webhook_token: tokenData.token }),
      });

      const gatewayData = await res.json();

      if (res.status === 202) {
        // Insert placeholder row
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

        toast({
          title: t('aiChat.insightsSent'),
          description: t('aiChat.insightsDescription'),
        });
      } else {
        throw new Error(gatewayData.error || 'Gateway rejected the request');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to integrate insights.');
    } finally {
      setIntegrating(false);
    }
  }, [tripContext, loading, integrating, messages, toast]);

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
      <SheetContent side="right" className="w-full sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot size={18} className="text-primary" />
              <span className="truncate">{t('aiChat.title', { trip: tripLabel })}</span>
            </SheetTitle>
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
        </SheetHeader>

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
              placeholder={tripContext ? t('aiChat.inputPlaceholder', { trip: tripLabel }) : t('aiChat.inputDisabled')}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-h-[120px] min-h-[40px]"
              style={{ height: 'auto', overflow: 'auto' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
              disabled={loading || !tripContext}
            />
            <Button
              size="icon"
              className="shrink-0 rounded-xl h-10 w-10"
              onClick={sendMessage}
              disabled={!input.trim() || loading || !tripContext}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            {t('aiChat.disclaimer')}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
