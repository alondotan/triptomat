import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { enrichPoi } from '../_shared/enrichPoi.ts';

/**
 * POI enrichment edge function.
 *
 * Single POI:  POST { poiId, name, country? }
 * Batch (trip): POST { tripId }
 *
 * Enriches POIs missing coordinates and/or images using
 * Google Geocoding API + Google Places API + Pexels fallback.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const supabase = createSupabaseClient();

    // Batch mode: enrich all incomplete POIs for a trip
    if (body.tripId) {
      const { data: pois, error } = await supabase
        .from('points_of_interest')
        .select('id, name, location, image_url')
        .eq('trip_id', body.tripId)
        .eq('is_cancelled', false);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Filter to POIs missing coordinates or image
      const incomplete = (pois || []).filter((p: any) =>
        !p.location?.coordinates?.lat || !p.image_url
      );

      console.log(`[enrich-poi] Batch: ${incomplete.length}/${pois?.length || 0} POIs need enrichment for trip ${body.tripId}`);

      const results = [];
      for (const poi of incomplete) {
        const result = await enrichPoi(supabase, poi.id, poi.name, {
          city: poi.location?.city,
          country: poi.location?.country,
          address: poi.location?.address,
        });
        results.push({ id: poi.id, name: poi.name, ...result });

        // Small delay between API calls to be respectful
        if (incomplete.indexOf(poi) < incomplete.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      return new Response(JSON.stringify({ enriched: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single POI mode
    const { poiId, name, country, city, address } = body;
    if (!poiId || !name) {
      return new Response(JSON.stringify({ error: 'poiId and name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await enrichPoi(supabase, poiId, name, { city, country, address });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[enrich-poi] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
