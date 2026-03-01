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
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, webhook_token: webhookToken }),
      });

      const data = await res.json();

      if (res.status === 200) {
        setStatus('success');
        setMessage('Already analyzed — results available in Recommendations.');
      } else if (res.status === 202) {
        setStatus('success');
        setMessage('Submitted! Analysis in progress, check Recommendations in a moment.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }

      setUrl('');
    } catch {
      setStatus('error');
      setMessage('Failed to reach the server. Please try again.');
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link size={16} className="text-muted-foreground" />
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
        />
        <Button
          type="submit"
          disabled={!url.trim() || status === 'loading' || !webhookToken}
          size="sm"
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 'Analyze'}
        </Button>
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
      {!webhookToken && (
        <p className="text-xs text-muted-foreground">Loading your account token…</p>
      )}
    </div>
  );
}
