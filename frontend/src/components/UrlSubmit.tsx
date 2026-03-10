import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { urlSchema } from '@/schemas/url.schema';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function isMapsUrl(url: string) {
  return /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/.test(url);
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export function UrlSubmit() {
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('webhook_tokens')
      .select('token')
      .single()
      .then(({ data }) => setWebhookToken(data?.token ?? null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      // For Google Maps URLs: try the saved-list flow first
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
              ? `List imported! ${listData.new_places} places added to POIs.`
              : 'List synced — no new places found.'
          );
          setUrl('');
          return;
        }

        // NOT_A_LIST → fall through to gateway
        if (listRes.status !== 422 || listData.type !== 'NOT_A_LIST') {
          setStatus('error');
          setMessage(listData.error || 'Sync failed.');
          return;
        }
      }

      // Gateway flow: videos, websites, single Maps place
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
        setMessage('Already analyzed — results available in Recommendations.');
      } else if (res.status === 202) {
        // Insert a placeholder row so Recommendations page shows it immediately
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
        setMessage('Submitted! Analysis in progress.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }

      setUrl('');
    } catch (err) {
      setStatus('error');
      setMessage(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : 'Failed to reach the server. Please try again.'
      );
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link size={16} className="text-muted-foreground" aria-hidden="true" />
        <h2 className="font-semibold text-sm">Add from URL</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste a YouTube video, Google Maps link, or any travel page to extract recommendations.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={status === 'loading' || !webhookToken}
          className="flex-1 text-sm"
          aria-label="הזן כתובת URL"
          name="url"
          type="url"
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={!url.trim() || status === 'loading' || !webhookToken}
          size="sm"
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 'Analyze'}
        </Button>
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
        <p className="text-xs text-muted-foreground">Loading your account token…</p>
      )}
    </div>
  );
}
