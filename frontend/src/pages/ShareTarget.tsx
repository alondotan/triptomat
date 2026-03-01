import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function extractUrl(raw: string): string | null {
  const match = raw.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function isMapsUrl(url: string) {
  return /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/.test(url);
}

type Status = 'loading' | 'success' | 'cached' | 'list-imported' | 'error' | 'no-url';

export default function ShareTargetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const urlParam = searchParams.get('url') || '';
    const textParam = searchParams.get('text') || '';
    const sharedUrl = urlParam || extractUrl(textParam);

    if (!sharedUrl) {
      setStatus('no-url');
      return;
    }

    async function submit() {
      const { data: tokenData } = await supabase.from('webhook_tokens').select('token').single();
      const webhookToken = tokenData?.token;

      if (!webhookToken) {
        setStatus('error');
        setMessage('Could not load account token.');
        return;
      }

      try {
        // For Google Maps URLs: try the saved-list flow first
        if (isMapsUrl(sharedUrl) && tripId) {
          const listRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-maps-list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: sharedUrl, trip_id: tripId, token: webhookToken }),
          });
          const listData = await listRes.json();

          if (listRes.ok) {
            setStatus('list-imported');
            setMessage(
              listData.new_places > 0
                ? `${listData.new_places} places imported to POIs.`
                : 'List synced — no new places.'
            );
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
          body: JSON.stringify({ url: sharedUrl, webhook_token: webhookToken }),
        });

        if (res.status === 200) {
          setStatus('cached');
        } else if (res.status === 202) {
          setStatus('success');
        } else {
          const data = await res.json();
          setStatus('error');
          setMessage(data.error || 'Something went wrong.');
        }
      } catch {
        setStatus('error');
        setMessage('Failed to reach the server.');
      }
    }

    submit();
  }, [searchParams, tripId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full rounded-xl border bg-card p-6 space-y-4 text-center">
        <h1 className="text-lg font-bold">Triptomat</h1>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">Submitting shared link…</p>
          </div>
        )}

        {status === 'list-imported' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={32} className="text-green-500" />
            <p className="text-sm text-green-600 font-medium">{message}</p>
            <Button size="sm" className="gap-1.5" onClick={() => navigate('/pois')}>
              <ExternalLink size={14} />
              Go to POIs
            </Button>
          </div>
        )}

        {(status === 'success' || status === 'cached') && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={32} className="text-green-500" />
            <p className="text-sm text-green-600 font-medium">
              {status === 'cached'
                ? 'Already analyzed — results available.'
                : 'Submitted! Analysis in progress.'}
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => navigate('/recommendations')}>
              <ExternalLink size={14} />
              Go to Recommendations
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle size={32} className="text-destructive" />
            <p className="text-sm text-destructive">{message}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        )}

        {status === 'no-url' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No URL found in the shared content.</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
