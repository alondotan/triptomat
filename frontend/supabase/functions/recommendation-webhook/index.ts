import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { validateWebhookToken } from '../_shared/auth.ts';
import { mergeWithNewWins } from '../_shared/merge.ts';
import { fuzzyMatch } from '../_shared/matching.ts';
import { TYPE_TO_CATEGORY, GEO_TYPES, TIP_TYPES } from '../_shared/categories.ts';
import { buildSiteToCountryMap, buildSiteToCityMap } from '../_shared/mapUtils.ts';
import { enrichPoi } from '../_shared/enrichPoi.ts';

interface SiteHierarchyNode {
  site: string;
  site_type: string;
  sub_sites?: SiteHierarchyNode[];
}

/**
 * Sync incoming sites_hierarchy into the trip_locations table.
 * Walks the hierarchy tree and inserts any nodes not already present.
 */
async function syncSitesHierarchyToTripLocations(
  supabase: ReturnType<typeof createSupabaseClient>,
  tripId: string,
  hierarchy: SiteHierarchyNode[],
) {
  // Fetch all existing locations for this trip
  const { data: existing } = await supabase
    .from('trip_locations')
    .select('id, name, parent_id')
    .eq('trip_id', tripId);

  // Build a lookup: lowercase name → id (for finding parents)
  const nameToId = new Map<string, string>();
  for (const loc of (existing || [])) {
    nameToId.set((loc.name as string).toLowerCase(), loc.id as string);
  }

  // Recursively insert missing nodes
  async function walkAndInsert(nodes: SiteHierarchyNode[], parentId: string | null) {
    for (const node of nodes) {
      const key = node.site.toLowerCase();
      let nodeId = nameToId.get(key);

      if (!nodeId) {
        // Insert new location
        const { data: inserted } = await supabase
          .from('trip_locations')
          .insert({
            trip_id: tripId,
            parent_id: parentId,
            name: node.site,
            site_type: node.site_type,
            source: 'webhook',
          })
          .select('id')
          .maybeSingle();

        if (inserted) {
          nodeId = inserted.id as string;
          nameToId.set(key, nodeId);
        }
      }

      if (nodeId && node.sub_sites && node.sub_sites.length > 0) {
        await walkAndInsert(node.sub_sites, nodeId);
      }
    }
  }

  await walkAndInsert(hierarchy, null);
}

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

    // Check for existing row (frontend placeholder or duplicate)
    const { data: existing } = await supabase.from('source_recommendations').select('id, status').eq('recommendation_id', payload.recommendation_id).maybeSingle();

    // ── Failure webhook: update processing row to failed ──
    if (payload.status === 'failed') {
      if (existing) {
        await supabase.from('source_recommendations').update({
          status: 'failed',
          error: payload.error || 'Unknown error',
          source_title: payload.source_title || undefined,
          source_image: payload.source_image || undefined,
        }).eq('id', existing.id);
        return new Response(JSON.stringify({
          success: true,
          action: 'marked_failed',
          recommendation_id: payload.recommendation_id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // No existing row — insert a failed row for visibility
      await supabase.from('source_recommendations').insert([{
        recommendation_id: payload.recommendation_id,
        source_url: payload.source_url,
        source_title: payload.source_title || null,
        source_image: payload.source_image || null,
        status: 'failed',
        error: payload.error || 'Unknown error',
        analysis: {},
        linked_entities: [],
      }]);
      return new Response(JSON.stringify({
        success: true,
        action: 'inserted_failed',
        recommendation_id: payload.recommendation_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Idempotency: skip if a non-processing row already exists ──
    if (existing && existing.status !== 'processing') {
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

    // If existing row is 'processing' (frontend placeholder), we'll update it below
    const isUpsert = existing?.status === 'processing';
    const existingId = existing?.id;

    // Try to match a trip by country (scoped to user if token provided)
    let matchedTripId = null;
    const countrySites = (payload.analysis.sites_hierarchy || []).filter((s)=>s.site_type === 'country').map((s)=>({
        site: s.site,
        site_type: s.site_type
      }));
    if (countrySites.length > 0) {
      let tripQuery;
      if (userId) {
        // Look up trips via trip_members join
        const { data: memberRows } = await supabase
          .from('trip_members').select('trip_id, trips(id, countries)').eq('user_id', userId);
        tripQuery = (memberRows || []).map((r: any) => r.trips).filter(Boolean);
      } else {
        const { data: allTrips } = await supabase.from('trips').select('id, countries');
        tripQuery = allTrips || [];
      }
      const trips = tripQuery;
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
    console.log(`Matched trip: ${matchedTripId || 'none'}, source_image: ${payload.source_image ? 'YES' : 'NO'}, upsert: ${isUpsert} [v3]`);

    // Embed source_text inside analysis JSON if present (avoids DB migration)
    const analysisData = { ...payload.analysis };
    if (payload.source_text) {
      analysisData.source_text = payload.source_text;
    }

    // Insert or update source_recommendation
    let sourceRecId: string;
    if (isUpsert && existingId) {
      // Update the processing placeholder with real data
      const { error: updateError } = await supabase.from('source_recommendations').update({
        trip_id: matchedTripId,
        timestamp: payload.timestamp,
        source_url: payload.source_url,
        source_title: payload.source_title || null,
        source_image: payload.source_image || null,
        analysis: analysisData,
        status: matchedTripId ? 'linked' : 'pending',
        linked_entities: [],
      }).eq('id', existingId);
      if (updateError) throw updateError;
      sourceRecId = existingId;
    } else {
      const { data: rec, error: insertError } = await supabase.from('source_recommendations').insert([
        {
          recommendation_id: payload.recommendation_id,
          trip_id: matchedTripId,
          timestamp: payload.timestamp,
          source_url: payload.source_url,
          source_title: payload.source_title || null,
          source_image: payload.source_image || null,
          analysis: analysisData,
          status: matchedTripId ? 'linked' : 'pending',
          linked_entities: []
        }
      ]).select('id').single();
      if (insertError) throw insertError;
      sourceRecId = rec.id;
    }
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
      const siteToCountry = buildSiteToCountryMap(payload.analysis.sites_hierarchy || []);
      const siteToCity = buildSiteToCityMap(payload.analysis.sites_hierarchy || []);
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
                status: 'suggested',
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
          // Resolve item.site to city-level using hierarchy (e.g. "Hidden Beach" → "El Nido")
          const resolvedCity = siteToCity[(item.site || "").toLowerCase()] || item.site;
          // Fuzzy match: name + category, with optional city check when both have it
          const matchedPoi = existingPois?.find((p)=>{
            if (p.category !== poiCategory) return false;
            if (!fuzzyMatch(p.name, item.name)) return false;
            const existingCity = p.location?.city;
            const newCity = resolvedCity || item.location?.city;
            if (existingCity && newCity && !fuzzyMatch(existingCity, newCity)) return false;
            return true;
          });
          if (matchedPoi) {
            // Link to existing - add recommendation ref and merge location data
            const refs = matchedPoi.source_refs || {};
            const recIds = refs.recommendation_ids || [];
            if (!recIds.includes(sourceRecId)) {
              const incomingLocation = {
                country: siteToCountry[(item.site || "").toLowerCase()] || undefined,
                city: resolvedCity || undefined,
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
              const itemImage = item.image_url || payload.source_image;
              if (!(matchedPoi as any).image_url && itemImage) {
                updateFields.image_url = itemImage;
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
                status: 'suggested',
                is_paid: false,
                location: {
                  country: siteToCountry[(item.site || "").toLowerCase()] || null,
                  city: resolvedCity,
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
                image_url: item.image_url || payload.source_image || null
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

              // Assign to itinerary day if the recommendation has day info
              if (item.day != null && matchedTripId) {
                try {
                  // Find or create the itinerary_day for this day_number
                  const { data: existingDay } = await supabase
                    .from('itinerary_days')
                    .select('id, activities')
                    .eq('trip_id', matchedTripId)
                    .eq('day_number', item.day)
                    .maybeSingle();

                  let dayId: string;
                  let currentActivities: { id: string; type: string; order: number; schedule_state?: string }[];

                  if (existingDay) {
                    dayId = existingDay.id;
                    currentActivities = (existingDay.activities || []) as typeof currentActivities;
                  } else {
                    const { data: createdDay } = await supabase
                      .from('itinerary_days')
                      .insert([{ trip_id: matchedTripId, day_number: item.day }])
                      .select('id')
                      .single();
                    if (!createdDay) throw new Error('Failed to create itinerary day');
                    dayId = createdDay.id;
                    currentActivities = [];
                  }

                  // Add POI as potential activity if not already there
                  if (!currentActivities.some(a => a.type === 'poi' && a.id === newPoi.id)) {
                    currentActivities.push({
                      id: newPoi.id,
                      type: 'poi',
                      order: item.order ?? currentActivities.length + 1,
                      schedule_state: 'potential',
                    });
                    await supabase.from('itinerary_days').update({ activities: currentActivities }).eq('id', dayId);
                    console.log(`[itinerary] Assigned POI ${newPoi.id} to day ${item.day}, order ${item.order}`);
                  }
                } catch (e) {
                  console.error(`[itinerary] Failed to assign POI to day ${item.day}:`, e);
                }
              }

              // Fire-and-forget: enrich with coordinates + image if missing
              if (!item.image_url || !item.location?.coordinates?.lat) {
                const country = siteToCountry[(item.site || '').toLowerCase()] || '';
                const city = siteToCity[(item.site || '').toLowerCase()] || '';
                enrichPoi(supabase, newPoi.id, item.name, {
                  city, country, address: item.location?.address,
                }).catch(e => console.warn(`[enrich] Failed for "${item.name}":`, e));
              }
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
      // Sync sites_hierarchy into trip_locations table
      const sitesHierarchy = payload.analysis.sites_hierarchy || [];
      if (sitesHierarchy.length > 0) {
        try {
          await syncSitesHierarchyToTripLocations(supabase, matchedTripId, sitesHierarchy);
        } catch (e) {
          console.error('Failed to sync sites hierarchy to trip_locations:', e);
        }
      }

      // Update source_recommendation with linked entities
      if (linkedEntities.length > 0) {
        await supabase.from('source_recommendations').update({
          linked_entities: linkedEntities
        }).eq('id', sourceRecId);
      }

      // Send push notification to all trip members (fire-and-forget)
      const { data: members } = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', matchedTripId);
      if (members?.length) {
        const newCount = linkedEntities.filter(e => !e.matched_existing).length;
        const sourceTitle = payload.source_title || payload.source_url || 'a link';
        fetch(new URL('/functions/v1/send-notification', Deno.env.get('SUPABASE_URL')!).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({
            user_ids: members.map(m => m.user_id),
            title: 'Recommendation ready',
            body: `${newCount} new item${newCount !== 1 ? 's' : ''} from "${sourceTitle}"`,
            url: '/recommendations',
            tag: `rec-${sourceRecId}`,
          }),
        }).catch(e => console.error('Push notification failed:', e));

        // Send WhatsApp notification (fire-and-forget)
        fetch(new URL('/functions/v1/whatsapp-notify', Deno.env.get('SUPABASE_URL')!).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({
            user_ids: members.map(m => m.user_id),
            type: 'recommendation_ready',
            text: `✅ ${newCount} new item${newCount !== 1 ? 's' : ''} from "${sourceTitle}" added to your trip!`,
            template_name: 'recommendation_ready',
            template_params: [sourceTitle, String(newCount)],
          }),
        }).catch(e => console.error('WhatsApp notification failed:', e));
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
