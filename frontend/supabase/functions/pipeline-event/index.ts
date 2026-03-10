import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';

const PIPELINE_TOKEN = Deno.env.get('PIPELINE_EVENT_TOKEN') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate via bearer token or query param
    const authHeader = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    const token = authHeader.replace('Bearer ', '') || url.searchParams.get('token') || '';

    if (!PIPELINE_TOKEN || token !== PIPELINE_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { job_id, stage, status, source_url, source_type, title, image, metadata } = body;

    if (!job_id || !stage) {
      return new Response(JSON.stringify({ error: 'job_id and stage are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient();

    const { error } = await supabase.from('pipeline_events').insert({
      job_id,
      stage,
      status: status || 'started',
      source_url: source_url || null,
      source_type: source_type || null,
      title: title || null,
      image: image || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error('Insert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Pipeline event error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
