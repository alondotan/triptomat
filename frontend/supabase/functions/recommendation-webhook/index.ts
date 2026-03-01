import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { validateWebhookToken } from '../_shared/auth.ts';
import { mergeWithNewWins } from '../_shared/merge.ts';
import { fuzzyMatch } from '../_shared/matching.ts';
import { TYPE_TO_CATEGORY, GEO_TYPES, TIP_TYPES } from '../_shared/categories.ts';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const supabase = createSupabaseClient();
    // ── Resolve user from token ──
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    let userId = null;
    if (token) {
      const result = await validateWebhookToken(supabase, token);
      if (result.valid) userId = result.userId;
      else {
        return new Response(JSON.stringify({
          error: 'Invalid webhook token'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    const payload = await req.json();
    console.log('Received recommendation payload, userId:', userId);
    // Idempotency check
    const { data: existing } = await supabase.from('source_recommendations').select('id').eq('recommendation_id', payload.recommendation_id).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        success: true,
        action: 'duplicate_skipped',
        recommendation_id: payload.recommendation_id
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Try to match a trip by country (scoped to user if token provided)
    let matchedTripId = null;
    const countrySites = (payload.analysis.sites_hierarchy || []).filter((s)=>s.site_type === 'country').map((s)=>({
        site: s.site,
        site_type: s.site_type
      }));
    if (countrySites.length > 0) {
      let query = supabase.from('trips').select('id, countries');
      if (userId) query = query.eq('user_id', userId);
      const { data: trips } = await query;
      if (trips && trips.length > 0) {
        for (const trip of trips){
          const tripCountries = (trip.countries || []).map((c)=>c.toLowerCase());
          if (countrySites.some((s)=>tripCountries.includes(s.site.toLowerCase()))) {
            matchedTripId = trip.id;
            break;
          }
        }
      }
    }
    console.log(`Matched trip: ${matchedTripId || 'none'}, source_image: ${payload.source_image ? 'YES' : 'NO'} [v2]`);
    // Insert source_recommendation
    const { data: rec, error: insertError } = await supabase.from('source_recommendations').insert([
      {
        recommendation_id: payload.recommendation_id,
        trip_id: matchedTripId,
        timestamp: payload.timestamp,
        source_url: payload.source_url,
        source_title: payload.source_title || null,
        source_image: payload.source_image || null,
        analysis: payload.analysis,
        status: matchedTripId ? 'linked' : 'pending',
        linked_entities: []
      }
    ]).select('id').single();
    if (insertError) throw insertError;
    const sourceRecId = rec.id;
    // If matched to a trip, process extracted items with fuzzy entity matching
    const linkedEntities = [];
    if (matchedTripId) {
      // Pre-fetch existing entities for this trip
      const [{ data: existingPois }, { data: existingTransport }, { data: existingContacts }] = await Promise.all([
        supabase.from('points_of_interest').select('id, name, category, location, source_refs, image_url').eq('trip_id', matchedTripId),
        supabase.from('transportation').select('id, category, additional_info, source_refs').eq('trip_id', matchedTripId),
        supabase.from('contacts').select('id, name, role').eq('trip_id', matchedTripId)
      ]);
      const items = payload.analysis.recommendations || [];
      console.log(`[debug] Processing ${items.length} items`);
      for (const item of items){
        const itemType = item.category;
        console.log(`[debug] Item: "${item.name}", type: "${itemType}"`);
        // Skip geo locations, tips, and bad-sentiment items
        if (GEO_TYPES.has(itemType) || TIP_TYPES.has(itemType) || item.sentiment === 'bad') {
          console.log(`[debug] Skipped (geo/tip/bad): ${itemType}`);
          continue;
        }
        const dbCategory = TYPE_TO_CATEGORY[itemType];
        if (!dbCategory) { console.log(`[debug] Skipped (no mapping for "${itemType}")`); continue; }
        if (dbCategory === 'transportation') {
          // Fuzzy match: check if transportation with similar name exists
          const matchedTransport = existingTransport?.find((t)=>{
            const info = t.additional_info;
            const existingName = info?.name || '';
            return existingName && fuzzyMatch(existingName, item.name);
          });
          if (matchedTransport) {
            // Link to existing - add recommendation ref
            const refs = matchedTransport.source_refs || {};
            const recIds = refs.recommendation_ids || [];
            if (!recIds.includes(sourceRecId)) {
              await supabase.from('transportation').update({
                source_refs: {
                  ...refs,
                  recommendation_ids: [
                    ...recIds,
                    sourceRecId
                  ]
                }
              }).eq('id', matchedTransport.id);
            }
            linkedEntities.push({
              entity_type: 'transportation',
              entity_id: matchedTransport.id,
              description: item.name,
              matched_existing: true
            });
          } else {
            // Create new transportation
            const { data: newT } = await supabase.from('transportation').insert([
              {
                trip_id: matchedTripId,
                category: itemType,
                status: 'candidate',
                is_paid: false,
                source_refs: {
                  email_ids: [],
                  recommendation_ids: [
                    sourceRecId
                  ]
                },
                cost: {
                  total_amount: 0,
                  currency: 'USD'
                },
                booking: {},
                segments: [],
                additional_info: {
                  name: item.name,
                  from_recommendation: true,
                  paragraph: item.paragraph,
                  site: item.site
                }
              }
            ]).select('id').single();
            if (newT) {
              linkedEntities.push({
                entity_type: 'transportation',
                entity_id: newT.id,
                description: item.name,
                matched_existing: false
              });
            }
          }
        } else {
          // POI: accommodation, eatery, attraction, service
          const poiCategory = dbCategory;
          // Fuzzy match: name + category, with optional city check when both have it
          const matchedPoi = existingPois?.find((p)=>{
            if (p.category !== poiCategory) return false;
            if (!fuzzyMatch(p.name, item.name)) return false;
            const existingCity = p.location?.city;
            const newCity = item.site || item.location?.city;
            if (existingCity && newCity && !fuzzyMatch(existingCity, newCity)) return false;
            return true;
          });
          if (matchedPoi) {
            // Link to existing - add recommendation ref and merge location data
            const refs = matchedPoi.source_refs || {};
            const recIds = refs.recommendation_ids || [];
            if (!recIds.includes(sourceRecId)) {
              const incomingLocation = {
                city: item.site || undefined,
                address: item.location?.address || undefined,
                coordinates: item.location?.coordinates || undefined
              };
              const mergedLocation = mergeWithNewWins(matchedPoi.location, incomingLocation);
              const updateFields = {
                source_refs: {
                  ...refs,
                  recommendation_ids: [
                    ...recIds,
                    sourceRecId
                  ]
                },
                location: mergedLocation
              };
              // Set image if the existing POI doesn't have one
              console.log(`[image] matched POI ${matchedPoi.id}, existing image_url: ${(matchedPoi as any).image_url}, source_image: ${payload.source_image?.substring(0, 60)}`);
              if (!(matchedPoi as any).image_url && payload.source_image) {
                updateFields.image_url = payload.source_image;
                console.log(`[image] Setting image_url on POI ${matchedPoi.id}`);
              }
              const { error: updateErr } = await supabase.from('points_of_interest').update(updateFields).eq('id', matchedPoi.id);
              if (updateErr) console.error('[image] POI update error:', updateErr);
            }
            linkedEntities.push({
              entity_type: 'poi',
              entity_id: matchedPoi.id,
              description: item.name,
              matched_existing: true
            });
          } else {
            // Create new POI
            console.log(`[debug] Creating new POI: "${item.name}", category: "${poiCategory}"`);
            const { data: newPoi, error: poiInsertErr } = await supabase.from('points_of_interest').insert([
              {
                trip_id: matchedTripId,
                category: poiCategory,
                sub_category: itemType,
                name: item.name,
                status: 'candidate',
                is_paid: false,
                location: {
                  city: item.site,
                  address: item.location?.address,
                  coordinates: item.location?.coordinates
                },
                source_refs: {
                  email_ids: [],
                  recommendation_ids: [
                    sourceRecId
                  ]
                },
                details: {
                  from_recommendation: true,
                  paragraph: item.paragraph,
                  source_url: payload.source_url
                },
                image_url: payload.source_image || null
              }
            ]).select('id').single();
            if (poiInsertErr) console.error(`[debug] POI insert error:`, poiInsertErr);
            if (newPoi) {
              console.log(`[debug] Created POI ${newPoi.id}`);
              linkedEntities.push({
                entity_type: 'poi',
                entity_id: newPoi.id,
                description: item.name,
                matched_existing: false
              });
            }
          }
        }
      }
      // Process contacts extracted by the AI
      const contacts = payload.analysis.contacts || [];
      for (const contact of contacts){
        if (!contact.name) continue;
        // Fuzzy match against existing contacts
        const matchedContact = existingContacts?.find((c)=>fuzzyMatch(c.name, contact.name));
        if (matchedContact) {
          linkedEntities.push({
            entity_type: 'contact',
            entity_id: matchedContact.id,
            description: contact.name,
            matched_existing: true
          });
        } else {
          const ROLE_MAP = {
            guide: 'guide',
            host: 'host',
            rental: 'rental',
            restaurant: 'restaurant',
            driver: 'driver',
            agency: 'agency'
          };
          const role = ROLE_MAP[contact.role || ''] || 'other';
          const { data: newContact } = await supabase.from('contacts').insert([
            {
              trip_id: matchedTripId,
              name: contact.name,
              role,
              phone: contact.phone || null,
              email: contact.email || null,
              website: contact.website || null,
              notes: contact.paragraph || null
            }
          ]).select('id').single();
          if (newContact) {
            linkedEntities.push({
              entity_type: 'contact',
              entity_id: newContact.id,
              description: contact.name,
              matched_existing: false
            });
          }
        }
      }
      // Update source_recommendation with linked entities
      if (linkedEntities.length > 0) {
        await supabase.from('source_recommendations').update({
          linked_entities: linkedEntities
        }).eq('id', sourceRecId);
      }
    }
    return new Response(JSON.stringify({
      success: true,
      source_recommendation_id: sourceRecId,
      matched: !!matchedTripId,
      trip_id: matchedTripId,
      linked_entities: linkedEntities,
      created_entities: linkedEntities.filter((e)=>!e.matched_existing).length,
      matched_entities: linkedEntities.filter((e)=>e.matched_existing).length,
      status: matchedTripId ? 'linked' : 'pending'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Recommendation webhook error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
