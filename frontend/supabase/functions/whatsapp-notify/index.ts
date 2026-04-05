import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { SQSClient, SendMessageCommand } from 'https://esm.sh/@aws-sdk/client-sqs@3.600.0';

/**
 * Send WhatsApp notifications via SQS queue.
 *
 * Called internally by other Edge Functions (fire-and-forget).
 * Looks up whatsapp_users for the target user_ids and enqueues
 * notification messages to the triptomat-whatsapp-notify SQS queue.
 *
 * Payload: {
 *   user_ids: string[],
 *   text: string,                              // message for in-window
 *   template_name?: string,                    // template for out-of-window
 *   template_params?: string[],
 *   type?: 'recommendation_ready' | 'booking_confirmed' | 'text'
 * }
 */

const SQS_QUEUE_URL = Deno.env.get('WHATSAPP_NOTIFY_QUEUE_URL') || '';
const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-central-1';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID') || '';
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY') || '';

const sqsClient = new SQSClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SQS_QUEUE_URL) {
      console.warn('WHATSAPP_NOTIFY_QUEUE_URL not configured — skipping WhatsApp notifications');
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'not_configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient();
    const { user_ids, text, template_name, template_params, type } = await req.json();

    if (!user_ids?.length) {
      return new Response(JSON.stringify({ error: 'user_ids required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up WhatsApp-linked users
    const { data: waUsers, error } = await supabase
      .from('whatsapp_users')
      .select('phone_number, last_message_at')
      .in('user_id', user_ids);

    if (error) throw error;
    if (!waUsers?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no_whatsapp_users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enqueue a notification for each WhatsApp user
    const results = await Promise.allSettled(
      waUsers.map(async (wu) => {
        const message = {
          phone: wu.phone_number,
          type: type || 'text',
          text: text || '',
          template_name: template_name || '',
          template_params: template_params || [],
          last_message_at: wu.last_message_at,
        };

        const command = new SendMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify(message),
        });

        await sqsClient.send(command);
        return { phone: wu.phone_number, success: true };
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;

    return new Response(JSON.stringify({ success: true, sent, total: waUsers.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('WhatsApp notify error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
