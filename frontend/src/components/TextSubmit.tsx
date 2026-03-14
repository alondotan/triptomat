import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, ClipboardPaste } from 'lucide-react';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

type Status = 'idle' | 'loading' | 'success' | 'error';

export function TextSubmit() {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;
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
        // Insert placeholder row for progressive loading
        const jobId = data.job_id;
        const meta = data.source_metadata || {};
        if (jobId && tripId) {
          await supabase.from('source_recommendations').insert([{
            recommendation_id: jobId,
            trip_id: tripId,
            source_title: meta.title || null,
            status: 'processing',
            analysis: {},
            linked_entities: [],
          }]);
        }
        setStatus('success');
        setMessage(t('textSubmit.submitted'));
        setText('');
        setExpanded(false);
      } else {
        setStatus('error');
        setMessage(data.error || t('common.somethingWentWrong'));
      }
    } catch {
      setStatus('error');
      setMessage(t('urlSubmit.serverError'));
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-muted-foreground" aria-hidden="true" />
          <h2 className="font-semibold text-sm">{t('textSubmit.title')}</h2>
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-muted-foreground" />
          : <ChevronDown size={16} className="text-muted-foreground" />
        }
      </button>

      {expanded && (
        <>
          <p className="text-xs text-muted-foreground">
            {t('textSubmit.description')}
          </p>
          <form onSubmit={handleSubmit} className="space-y-2">
            <Textarea
              placeholder={t('textSubmit.placeholder')}
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={status === 'loading' || !webhookToken}
              className="min-h-[100px] text-sm"
              dir="auto"
              aria-label="הזן טקסט"
              name="text"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={status === 'loading' || !webhookToken}
                onClick={async () => {
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip) setText(clip.trim());
                  } catch { /* clipboard permission denied */ }
                }}
              >
                <ClipboardPaste size={14} className="me-1.5" />
                {t('common_paste')}
              </Button>
              <Button
                type="submit"
                disabled={!text.trim() || status === 'loading' || !webhookToken}
                size="sm"
              >
                {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : t('textSubmit.analyze')}
              </Button>
            </div>
          </form>

          <div aria-live="polite">
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
          </div>
        </>
      )}
    </div>
  );
}
