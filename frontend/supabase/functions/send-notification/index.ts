import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import webpush from 'npm:web-push@3.6.7';

/**
 * Send push notifications to specified users.
 *
 * Called internally by other Edge Functions or via supabase.functions.invoke().
 * Payload: { user_ids: string[], title: string, body: string, url?: string, tag?: string }
 */

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails(
  'mailto:alon@triptomat.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const { user_ids, title, body, url, tag } = await req.json();

    if (!user_ids?.length || !title) {
      return new Response(JSON.stringify({ error: 'user_ids and title are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all push subscriptions for the target users
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys, user_id')
      .in('user_id', user_ids);

    if (error) throw error;
    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no_subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({ title, body, url, tag });

    // Send to all subscriptions in parallel
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        };
        try {
          await webpush.sendNotification(pushSub, payload);
          return { success: true, endpoint: sub.endpoint };
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          return { success: false, endpoint: sub.endpoint, status: statusCode };
        }
      })
    );

    // Clean up expired/invalid subscriptions (410 Gone or 404)
    const toDelete: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.success) {
        const status = r.value.status;
        if (status === 410 || status === 404) {
          toDelete.push(r.value.endpoint);
        }
      }
    }
    if (toDelete.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', toDelete);
    }

    const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    return new Response(JSON.stringify({ success: true, sent, total: subscriptions.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Send notification error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
