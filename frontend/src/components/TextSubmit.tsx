import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

type Status = 'idle' | 'loading' | 'success' | 'error';

export function TextSubmit() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    supabase
      .from('webhook_tokens')
      .select('token')
      .single()
      .then(({ data }) => setWebhookToken(data?.token ?? null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !webhookToken) return;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, webhook_token: webhookToken }),
      });

      const data = await res.json();

      if (res.status === 202) {
        setStatus('success');
        setMessage('Submitted! Analysis in progress, check back in a moment.');
        setText('');
        setExpanded(false);
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Failed to reach the server. Please try again.');
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-muted-foreground" />
          <h2 className="font-semibold text-sm">Paste text</h2>
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-muted-foreground" />
          : <ChevronDown size={16} className="text-muted-foreground" />
        }
      </button>

      {expanded && (
        <>
          <p className="text-xs text-muted-foreground">
            Paste text from a message, article, or any source to extract travel recommendations.
          </p>
          <form onSubmit={handleSubmit} className="space-y-2">
            <Textarea
              placeholder="Paste travel recommendations text here..."
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={status === 'loading' || !webhookToken}
              className="min-h-[100px] text-sm"
              dir="auto"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!text.trim() || status === 'loading' || !webhookToken}
                size="sm"
              >
                {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 'Analyze'}
              </Button>
            </div>
          </form>

          {status === 'success' && (
            <p className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle size={13} /> {message}
            </p>
          )}
          {status === 'error' && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle size={13} /> {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
