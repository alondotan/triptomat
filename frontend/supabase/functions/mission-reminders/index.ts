import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';

/**
 * Check for overdue missions and send notifications.
 *
 * Designed to be called by pg_cron every ~15 minutes.
 * Finds missions where due_date has passed, status is still 'pending',
 * and no due-date notification has been sent yet.
 * Sends push + WhatsApp notifications to all trip members.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createSupabaseClient();

    // Find overdue pending missions that haven't been notified yet
    const { data: overdueMissions, error } = await supabase
      .from('missions')
      .select('id, trip_id, title, due_date, reminders')
      .eq('status', 'pending')
      .lte('due_date', new Date().toISOString())
      .not('due_date', 'is', null);

    if (error) throw error;
    if (!overdueMissions?.length) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_overdue_missions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter out missions that already had a due-date notification sent
    const unnotified = overdueMissions.filter((m) => {
      const reminders = (m.reminders || []) as Array<{ reminder_id: string; is_sent: boolean }>;
      return !reminders.some((r) => r.reminder_id === 'due_date_overdue' && r.is_sent);
    });

    if (!unnotified.length) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'all_already_notified' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group missions by trip_id for efficient member lookup
    const byTrip = new Map<string, typeof unnotified>();
    for (const m of unnotified) {
      const list = byTrip.get(m.trip_id) || [];
      list.push(m);
      byTrip.set(m.trip_id, list);
    }

    let totalNotified = 0;

    for (const [tripId, missions] of byTrip) {
      const { data: members } = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId);

      if (!members?.length) continue;

      const userIds = members.map((m) => m.user_id);

      for (const mission of missions) {
        const title = 'Overdue task';
        const body = `"${mission.title}" is past its due date`;

        // Send push notification
        fetch(new URL('/functions/v1/send-notification', Deno.env.get('SUPABASE_URL')!).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({
            user_ids: userIds,
            title,
            body,
            url: '/tasks',
            tag: `mission-overdue-${mission.id}`,
          }),
        }).catch((e) => console.error('Push notification failed:', e));

        // Send WhatsApp notification
        fetch(new URL('/functions/v1/whatsapp-notify', Deno.env.get('SUPABASE_URL')!).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({
            user_ids: userIds,
            type: 'text',
            text: `\u23f0 ${title}: ${body}`,
          }),
        }).catch((e) => console.error('WhatsApp notification failed:', e));

        // Mark as notified by appending to reminders array
        const existingReminders = (mission.reminders || []) as Array<Record<string, unknown>>;
        existingReminders.push({
          reminder_id: 'due_date_overdue',
          remind_at: mission.due_date,
          is_sent: true,
          sent_at: new Date().toISOString(),
        });

        await supabase
          .from('missions')
          .update({ reminders: existingReminders })
          .eq('id', mission.id);

        totalNotified++;
      }
    }

    return new Response(JSON.stringify({ success: true, notified: totalNotified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Mission reminders error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
