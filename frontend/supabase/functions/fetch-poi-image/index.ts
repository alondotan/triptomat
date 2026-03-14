import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { poiId, name, country } = await req.json();
    if (!poiId || !name) {
      return new Response(JSON.stringify({ error: 'poiId and name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!PEXELS_API_KEY) {
      console.error('[fetch-poi-image] PEXELS_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Pexels API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build search query: "attraction_name country_name"
    const query = country ? `${name} ${country}` : name;
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;

    const pexelsRes = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!pexelsRes.ok) {
      console.error(`[fetch-poi-image] Pexels API error: ${pexelsRes.status}`);
      return new Response(JSON.stringify({ error: 'Pexels API error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await pexelsRes.json();
    const imageUrl: string | null = data.photos?.[0]?.src?.landscape || null;

    if (!imageUrl) {
      return new Response(JSON.stringify({ imageUrl: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the POI's image_url in the database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error: updateErr } = await supabase
      .from('points_of_interest')
      .update({ image_url: imageUrl })
      .eq('id', poiId)
      .is('image_url', null); // Only set if still null (avoid race conditions)

    if (updateErr) {
      console.error('[fetch-poi-image] DB update error:', updateErr);
    }

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[fetch-poi-image] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
