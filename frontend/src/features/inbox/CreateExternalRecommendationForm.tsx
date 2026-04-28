import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertCircle, Link, FileText, ClipboardPaste } from 'lucide-react';
import { urlSchema } from '@/schemas/url.schema';

type ExtractedItem = { name: string; category: string };

function buildItemSummary(items: ExtractedItem[], t: (k: string) => string): string {
  if (!items.length) return '';
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item.category || 'other';
    counts[key] = (counts[key] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([cat, n]) => {
    const label = t(`poiCategory.${cat}`) !== `poiCategory.${cat}` ? t(`poiCategory.${cat}`) : cat;
    return `${n} ${label}`;
  });
  return parts.join(', ');
}

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
  const [itemSummary, setItemSummary] = useState('');
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
    setItemSummary('');
    setMode('url');
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const subscribeToJob = (jobId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    const channel = supabase
      .channel(`rec-done-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'source_recommendations', filter: `recommendation_id=eq.${jobId}` },
        (payload) => {
          const rec = payload.new as Record<string, unknown>;
          const newStatus = rec?.status as string | undefined;
          if (newStatus && newStatus !== 'processing') {
            const analysis = rec?.analysis as { recommendations?: ExtractedItem[]; extracted_items?: ExtractedItem[] } | undefined;
            const items: ExtractedItem[] = analysis?.recommendations || analysis?.extracted_items || [];
            const summary = buildItemSummary(items, t);
            setItemSummary(summary ? t('urlSubmit.analysisComplete', { summary }) : t('urlSubmit.analysisDone'));
            setMessage('');
            supabase.removeChannel(channel);
            channelRef.current = null;
            setTimeout(() => onOpenChange(false), 1500);
          }
        }
      )
      .subscribe();
    channelRef.current = channel;
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
          setTimeout(() => onOpenChange(false), 1500);
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
        // Fetch existing result to show item counts
        const { data: existing } = await supabase
          .from('source_recommendations')
          .select('analysis')
          .eq('source_url', trimmed)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const analysis = existing?.analysis as unknown as { recommendations?: ExtractedItem[]; extracted_items?: ExtractedItem[] } | null;
        const items: ExtractedItem[] = analysis?.recommendations || analysis?.extracted_items || [];
        const summary = buildItemSummary(items, t);
        setMessage(t('urlSubmit.alreadyAnalyzed'));
        if (summary) setItemSummary(summary);
        setTimeout(() => onOpenChange(false), 1500);
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
          subscribeToJob(jobId);
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
        setTimeout(() => onOpenChange(false), 1500);
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
      <DialogContent preventAutoFocus className="max-w-md max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 bg-card/95 backdrop-blur-sm">
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
              <div className="flex gap-2">
                <Input
                  id="ext-url"
                  placeholder={t('urlSubmit.placeholder')}
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={isDisabled}
                  type="url"
                  autoComplete="off"
                  dir="ltr"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isDisabled}
                  onClick={async () => {
                    try {
                      const clip = await navigator.clipboard.readText();
                      if (clip) setUrl(clip.trim());
                    } catch { /* clipboard permission denied */ }
                  }}
                  title={t('common_paste')}
                >
                  <ClipboardPaste size={16} />
                </Button>
              </div>
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
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isDisabled}
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
              </div>
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

        <div aria-live="polite" className="space-y-1">
          {status === 'success' && message && (
            <p className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle size={13} /> {message}
            </p>
          )}
          {itemSummary && (
            <p className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
              <CheckCircle size={13} /> {itemSummary}
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
