import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertCircle, Link, FileText } from 'lucide-react';
import { urlSchema } from '@/schemas/url.schema';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

type Status = 'idle' | 'loading' | 'success' | 'error';
type InputMode = 'url' | 'text';

function isMapsUrl(url: string) {
  return /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/.test(url);
}

interface CreateExternalRecommendationFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateExternalRecommendationForm({ open, onOpenChange }: CreateExternalRecommendationFormProps) {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const [mode, setMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      supabase
        .from('webhook_tokens')
        .select('token')
        .single()
        .then(({ data }) => setWebhookToken(data?.token ?? null));
    }
  }, [open]);

  const resetForm = () => {
    setUrl('');
    setText('');
    setStatus('idle');
    setMessage('');
    setMode('url');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const handleSubmitUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed || !webhookToken) return;

    const validation = urlSchema.safeParse(trimmed);
    if (!validation.success) {
      setStatus('error');
      setMessage(validation.error.issues[0].message);
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      // Google Maps saved-list flow
      if (isMapsUrl(trimmed) && tripId) {
        const listRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-maps-list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed, trip_id: tripId, token: webhookToken }),
        });
        const listData = await listRes.json();

        if (listRes.ok) {
          setStatus('success');
          setMessage(
            listData.new_places > 0
              ? t('urlSubmit.listImported', { count: listData.new_places })
              : t('urlSubmit.listSynced')
          );
          setUrl('');
          return;
        }

        if (listRes.status !== 422 || listData.type !== 'NOT_A_LIST') {
          setStatus('error');
          setMessage(listData.error || 'Sync failed.');
          return;
        }
      }

      // Gateway flow
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, webhook_token: webhookToken }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();

      if (res.status === 200) {
        setStatus('success');
        setMessage(t('urlSubmit.alreadyAnalyzed'));
      } else if (res.status === 202) {
        const jobId = data.job_id;
        const meta = data.source_metadata || {};
        if (jobId && tripId) {
          await supabase.from('source_recommendations').insert([{
            recommendation_id: jobId,
            trip_id: tripId,
            source_url: trimmed,
            source_title: meta.title || null,
            source_image: meta.image || null,
            status: 'processing',
            analysis: {},
            linked_entities: [],
          }]);
        }
        setStatus('success');
        setMessage(t('urlSubmit.submitted'));
      } else {
        setStatus('error');
        setMessage(data.error || t('common.somethingWentWrong'));
      }

      setUrl('');
    } catch (err) {
      setStatus('error');
      setMessage(
        err instanceof DOMException && err.name === 'AbortError'
          ? t('urlSubmit.timeout')
          : t('urlSubmit.serverError')
      );
    }
  };

  const handleSubmitText = async () => {
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
      } else {
        setStatus('error');
        setMessage(data.error || t('common.somethingWentWrong'));
      }
    } catch {
      setStatus('error');
      setMessage(t('urlSubmit.serverError'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'url') handleSubmitUrl();
    else handleSubmitText();
  };

  const isDisabled = status === 'loading' || !webhookToken;
  const isEmpty = mode === 'url' ? !url.trim() : !text.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent preventAutoFocus className="max-w-md max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0">
        <DialogHeader>
          <DialogTitle>{t('externalRec.title')}</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === 'url' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setMode('url')}
          >
            <Link size={14} />
            {t('externalRec.urlTab')}
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === 'text' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setMode('text')}
          >
            <FileText size={14} />
            {t('externalRec.textTab')}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {mode === 'url' ? t('urlSubmit.description') : t('textSubmit.description')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'url' ? (
            <div className="space-y-2">
              <Label htmlFor="ext-url">{t('externalRec.urlLabel')}</Label>
              <Input
                id="ext-url"
                placeholder={t('urlSubmit.placeholder')}
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={isDisabled}
                type="url"
                autoComplete="off"
                dir="ltr"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ext-text">{t('externalRec.textLabel')}</Label>
              <Textarea
                id="ext-text"
                placeholder={t('textSubmit.placeholder')}
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={isDisabled}
                className="min-h-[120px]"
                dir="auto"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={isEmpty || isDisabled}>
              {status === 'loading' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                mode === 'url' ? t('urlSubmit.analyze') : t('textSubmit.analyze')
              )}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
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

        {!webhookToken && (
          <p className="text-xs text-muted-foreground">{t('urlSubmit.loadingToken')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
