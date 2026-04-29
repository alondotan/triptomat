import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { enrichPoi } from '../_shared/enrichPoi.ts';
import { fetchWikipediaImage } from '../_shared/wikipedia.ts';

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

    // Trip place image mode: fetch and persist image for a trip_place
    if (body.tripPlaceId) {
      const { tripPlaceId, locationName, country } = body;
      if (!locationName) {
        return new Response(JSON.stringify({ error: 'locationName required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[enrich-trip-place] Fetching image for "${locationName}" (country: ${country})`);
      const imageUrl = await fetchWikipediaImage(locationName, country);

      if (imageUrl) {
        const { error } = await supabase
          .from('trip_places')
          .update({ image_url: imageUrl })
          .eq('id', tripPlaceId);
        if (error) console.error('[enrich-trip-place] Failed to update image:', error);
        else console.log(`[enrich-trip-place] Image saved for trip_place ${tripPlaceId}`);
      } else {
        console.log(`[enrich-trip-place] No Wikipedia image found for "${locationName}"`);
      }

      return new Response(JSON.stringify({ imageUrl: imageUrl || null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch mode: enrich all incomplete POIs for a trip
    if (body.tripId) {
      const { data: pois, error } = await supabase
        .from('points_of_interest')
        .select('id, name, category, place_type, activity_type, location, image_url')
        .eq('trip_id', body.tripId)
        .eq('is_cancelled', false);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Filter to POIs missing coordinates, image, or type
      const incomplete = (pois || []).filter((p: any) =>
        !p.location?.coordinates?.lat || !p.image_url || (!p.place_type && !p.activity_type)
      );

      console.log(`[enrich-poi] Batch: ${incomplete.length}/${pois?.length || 0} POIs need enrichment for trip ${body.tripId}`);

      const results = [];
      for (const poi of incomplete) {
        const result = await enrichPoi(supabase, poi.id, poi.name, {
          city: poi.location?.city,
          country: poi.location?.country,
          address: poi.location?.address,
          category: poi.category,
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
    const { poiId, name, country, city, address, category } = body;
    if (!poiId || !name) {
      return new Response(JSON.stringify({ error: 'poiId and name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await enrichPoi(supabase, poiId, name, { city, country, address, category });

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
