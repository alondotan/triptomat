import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatMessageRow {
  id: string;
  trip_id: string;
  user_id: string;
  role: string;
  content: string;
  tool_calls: unknown;
  source: string;
  created_at: string;
}

function rowToMessage(row: ChatMessageRow): Message {
  return {
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
  };
}

export function useChatHistory(tripId: string | undefined): {
  messages: Message[];
  isLoading: boolean;
  appendMessages: (msgs: Array<{ role: Message['role']; content: string; toolCalls?: unknown }>) => Promise<void>;
  clearHistory: () => Promise<void>;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tripId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('trip_id', tripId)
          .order('created_at', { ascending: true })
          .limit(100);

        if (cancelled) return;

        if (error) {
          console.error('[useChatHistory] Failed to load chat history:', error);
          setIsLoading(false);
          return;
        }

        const dbRows = (rows ?? []) as ChatMessageRow[];

        if (dbRows.length === 0) {
          // Attempt localStorage migration
          const localKey = `triptomat_chat_${tripId}`;
          try {
            const raw = localStorage.getItem(localKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id;

                if (userId && !cancelled) {
                  const insertRows = parsed
                    .filter((m: unknown): m is { role: string; content: string } =>
                      typeof m === 'object' && m !== null && 'role' in m && 'content' in m
                    )
                    .map((m) => ({
                      trip_id: tripId,
                      user_id: userId,
                      role: m.role === 'assistant' ? 'assistant' : 'user',
                      content: String(m.content),
                      source: 'web' as const,
                    }));

                  if (insertRows.length > 0) {
                    const { error: insertError } = await supabase
                      .from('chat_messages')
                      .insert(insertRows);

                    if (insertError) {
                      console.error('[useChatHistory] Migration insert failed:', insertError);
                    } else {
                      localStorage.removeItem(localKey);
                      if (!cancelled) {
                        setMessages(insertRows.map((r) => ({ role: r.role as Message['role'], content: r.content })));
                      }
                    }
                  }
                }
              }
            }
          } catch (migrationErr) {
            console.error('[useChatHistory] localStorage migration failed:', migrationErr);
          }
        } else {
          if (!cancelled) {
            setMessages(dbRows.map(rowToMessage));
          }
        }
      } catch (err) {
        console.error('[useChatHistory] Unexpected error loading history:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const appendMessages = useCallback(
    async (msgs: Array<{ role: Message['role']; content: string; toolCalls?: unknown }>) => {
      if (!tripId || msgs.length === 0) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          console.warn('[useChatHistory] No authenticated user, skipping persist');
          return;
        }

        const insertRows = msgs.map((m) => ({
          trip_id: tripId,
          user_id: userId,
          role: m.role,
          content: m.content,
          tool_calls: m.toolCalls ?? null,
          source: 'web' as const,
        }));

        const { error } = await supabase.from('chat_messages').insert(insertRows);
        if (error) {
          console.error('[useChatHistory] Failed to persist messages:', error);
        }
      } catch (err) {
        console.error('[useChatHistory] Unexpected error appending messages:', err);
      }
    },
    [tripId],
  );

  const clearHistory = useCallback(async () => {
    if (!tripId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', userId);

      if (error) {
        console.error('[useChatHistory] Failed to clear history:', error);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('[useChatHistory] Unexpected error clearing history:', err);
    }
  }, [tripId]);

  return { messages, isLoading, appendMessages, clearHistory };
}
