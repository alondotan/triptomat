import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeTrip } = useActiveTrip();
  const tripId = activeTrip?.id;

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;

    const urlParam = searchParams.get('url') || '';
    const textParam = searchParams.get('text') || '';
    const sharedUrl = urlParam || extractUrl(textParam);

    if (!sharedUrl) {
      setStatus('no-url');
      return;
    }

    submittedRef.current = true;
    console.log('[ShareTarget] submitting:', sharedUrl, 'tripId:', tripId);

    async function submit() {
      try {
        const { data: tokenData, error: tokenError } = await supabase.from('webhook_tokens').select('token').single();
        const webhookToken = tokenData?.token;

        if (!webhookToken) {
          console.error('[ShareTarget] no webhook token:', tokenError);
          setStatus('error');
          setMessage(t('shareTarget.couldNotLoadToken'));
          return;
        }

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

        const data = await res.json();

        if (res.status === 200) {
          setStatus('cached');
        } else if (res.status === 202) {
          // Insert placeholder so Recommendations page shows it immediately
          const jobId = data.job_id;
          const meta = data.source_metadata || {};
          if (jobId && tripId) {
            await supabase.from('source_recommendations').insert([{
              recommendation_id: jobId,
              trip_id: tripId,
              source_url: sharedUrl,
              source_title: meta.title || null,
              source_image: meta.image || null,
              status: 'processing',
              analysis: {},
              linked_entities: [],
            }]);
          }
          setStatus('success');
        } else {
          setStatus('error');
          setMessage(data.error || t('common.somethingWentWrong'));
        }
      } catch (err) {
        console.error('[ShareTarget] submit failed:', err);
        setStatus('error');
        setMessage(t('shareTarget.serverFailed'));
      }
    }

    submit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full rounded-xl border bg-card p-6 space-y-4 text-center">
        <h1 className="text-lg font-bold">{t('nav.triptomat')}</h1>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">{t('shareTarget.submitting')}</p>
          </div>
        )}

        {status === 'list-imported' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={32} className="text-green-500" />
            <p className="text-sm text-green-600 font-medium">{message}</p>
            <Button size="sm" className="gap-1.5" onClick={() => navigate('/attractions', { replace: true })}>
              <ExternalLink size={14} />
              {t('shareTarget.goToPOIs')}
            </Button>
          </div>
        )}

        {(status === 'success' || status === 'cached') && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={32} className="text-green-500" />
            <p className="text-sm text-green-600 font-medium">
              {status === 'cached'
                ? t('shareTarget.alreadyAnalyzed')
                : t('shareTarget.analysisSubmitted')}
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => navigate('/sources', { replace: true })}>
              <ExternalLink size={14} />
              {t('shareTarget.goToRecs')}
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle size={32} className="text-destructive" />
            <p className="text-sm text-destructive">{message}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/', { replace: true })}>
              {t('shareTarget.backToHome')}
            </Button>
          </div>
        )}

        {status === 'no-url' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('shareTarget.noUrl')}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/', { replace: true })}>
              {t('shareTarget.backToHome')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
