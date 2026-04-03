import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { validateWebhookToken } from '../_shared/auth.ts';
import { mergeWithNewWins } from '../_shared/merge.ts';
import { fuzzyMatch } from '../_shared/matching.ts';
import type { SiteNode } from '../_shared/types.ts';

interface WebhookPayload {
  metadata: {
    date: string;
    category: 'transportation' | 'accommodation' | 'attraction' | 'eatery';
    sub_category?: string;
    action: 'create' | 'update' | 'cancel';
    order_number: string;
    is_paid?: boolean;
  };
  sites_hierarchy?: SiteNode[];
  accommodation_details?: {
    establishment_name: string;
    rooms?: Array<{ room_type?: string; occupancy_details?: string }>;
    location_details: { street?: string | null; city?: string | null; country?: string | null };
    cost?: { amount: number; currency: string };
    checkin_date?: string;
    checkin_hour?: string;
    checkout_date?: string;
    checkout_hour?: string;
    free_cancellation_until?: string | null;
  };
  eatery_details?: {
    establishment_name: string;
    reservation_date?: string;
    reservation_hour?: string;
    location_details: { street?: string | null; city?: string | null; country?: string | null };
    free_cancellation_until?: string | null;
  };
  attraction_details?: {
    attraction_name: string;
    attraction_type?: string;
    cost?: { amount: number; currency: string };
    reservation_date?: string;
    reservation_hour?: string;
    location_details: { street?: string | null; city?: string | null; country?: string | null };
    free_cancellation_until?: string | null;
  };
  transportation_details?: {
    cost?: { amount: number; currency: string };
    segments: Array<{
      from: { name: string; code?: string | null; address: { street?: string; city?: string; country?: string } };
      to: { name: string; code?: string | null; address: { street?: string; city?: string; country?: string } };
      carrier?: string;
      flight_number?: string | null;
      departure_time: string;
      arrival_time: string;
    }>;
    baggage_allowance?: { cabin_bag?: string; checked_bag?: string };
    free_cancellation_until?: string | null;
  };
  additional_info?: { summary?: string; raw_notes?: string };
  source_email_info?: {
    subject?: string;
    sender?: string;
    date_sent?: string;
    email_permalink?: string;
    raw_content_cleaned?: string;
  };
  attachments?: Array<{
    filename: string;
    content_type: string;
    size: number;
    s3_url: string;
    s3_key: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
}

function extractCountries(h?: SiteNode[]): string[] {
  if (!h) return [];
  const out: string[] = [];
  for (const n of h) {
    if (n.site_type === 'country') out.push(n.site);
    if (n.sub_sites) out.push(...extractCountries(n.sub_sites));
  }
  return out;
}

function extractCities(h?: SiteNode[]): string[] {
  if (!h) return [];
  const out: string[] = [];
  const walk = (nodes: SiteNode[]) => {
    for (const n of nodes) {
      if (['city', 'town', 'village'].includes(n.site_type)) out.push(n.site);
      if (n.sub_sites?.length) walk(n.sub_sites);
    }
  };
  walk(h);
  return out;
}


const toUtcMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const msPerDay = 86400000;

// ── Itinerary day helpers ────────────────────────────────────────

async function unlinkAccommodationFromDays(supabase: any, tripId: string, poiId: string) {
  const { data: days } = await supabase.from('itinerary_days').select('id, accommodation_options').eq('trip_id', tripId);
  for (const day of (days || [])) {
    const opts = (day.accommodation_options || []) as any[];
    const filtered = opts.filter((a: any) => a.poi_id !== poiId);
    if (filtered.length !== opts.length) {
      await supabase.from('itinerary_days').update({ accommodation_options: filtered }).eq('id', day.id);
    }
  }
}

async function unlinkTransportFromDays(supabase: any, tripId: string, transportId: string) {
  const { data: days } = await supabase.from('itinerary_days').select('id, transportation_segments').eq('trip_id', tripId);
  for (const day of (days || [])) {
    const segs = (day.transportation_segments || []) as any[];
    const filtered = segs.filter((s: any) => s.transportation_id !== transportId);
    if (filtered.length !== segs.length) {
      await supabase.from('itinerary_days').update({ transportation_segments: filtered }).eq('id', day.id);
    }
  }
}

async function ensureDayAndLink(
  supabase: any, tripId: string, tripStart: string, tripEnd: string,
  days: any[], dateStr: string, linkFn: (day: any) => Promise<void>
) {
  if (dateStr < tripStart || dateStr > tripEnd) return;
  let day = days.find((d: any) => d.date === dateStr);
  if (!day) {
    const used = new Set<number>(days.map((d: any) => d.day_number));
    let num = Math.max(1, Math.floor((toUtcMs(dateStr) - toUtcMs(tripStart)) / msPerDay) + 1);
    while (used.has(num)) num++;
    const { data: created } = await supabase
      .from('itinerary_days')
      .insert([{ trip_id: tripId, day_number: num, date: dateStr }])
      .select('*').single();
    if (created) { days.push(created); day = created; }
  }
  if (day) await linkFn(day);
}

async function linkAccommodationToDays(
  supabase: any, tripId: string, poiId: string, checkin: string, checkout: string
) {
  const { data: tripData } = await supabase.from('trips').select('start_date, end_date').eq('id', tripId).single();
  if (!tripData) return;
  const { data: existingDays } = await supabase
    .from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number', { ascending: true });
  const days = existingDays || [];

  for (let ms = toUtcMs(checkin); ms < toUtcMs(checkout); ms += msPerDay) {
    const nightDate = new Date(ms).toISOString().split('T')[0];
    await ensureDayAndLink(supabase, tripId, tripData.start_date, tripData.end_date, days, nightDate, async (day) => {
      const opts = (day.accommodation_options || []) as any[];
      if (!opts.some((a: any) => a.poi_id === poiId)) {
        opts.push({ is_selected: true, poi_id: poiId });
        await supabase.from('itinerary_days').update({ accommodation_options: opts }).eq('id', day.id);
      }
    });
  }
}

async function linkTransportSegmentsToDays(
  supabase: any, tripId: string, transportId: string, segments: Array<{ segment_id: string; departure_time?: string }>
) {
  const { data: tripData } = await supabase.from('trips').select('start_date, end_date').eq('id', tripId).single();
  if (!tripData) return;
  const { data: existingDays } = await supabase
    .from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number', { ascending: true });
  const days = existingDays || [];

  for (const seg of segments) {
    if (!seg.departure_time) continue;
    const depDate = seg.departure_time.split('T')[0];
    await ensureDayAndLink(supabase, tripId, tripData.start_date, tripData.end_date, days, depDate, async (day) => {
      const segs = (day.transportation_segments || []) as any[];
      if (!segs.some((s: any) => s.transportation_id === transportId && s.segment_id === seg.segment_id)) {
        segs.push({ is_selected: true, transportation_id: transportId, segment_id: seg.segment_id });
        await supabase.from('itinerary_days').update({ transportation_segments: segs }).eq('id', day.id);
        // Keep in-memory object current so same-day segments don't overwrite each other
        day.transportation_segments = segs;
      }
    });
  }
}

// ── Find existing entity by order_number ─────────────────────────

async function findExistingPoi(supabase: any, tripId: string, orderNumber: string, category: string) {
  const { data } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('trip_id', tripId)
    .eq('category', category)
    .contains('details', { order_number: orderNumber });
  return data?.[0] || null;
}

async function findExistingTransport(supabase: any, tripId: string, orderNumber: string) {
  const { data } = await supabase
    .from('transportation')
    .select('*')
    .eq('trip_id', tripId)
    .contains('booking', { order_number: orderNumber });
  return data?.[0] || null;
}

/** Fuzzy-match by name + category (+ city when both have it). Used as fallback when no order_number match. */
async function findExistingPoiByNameAndLocation(
  supabase: any, tripId: string, name: string, category: string, city?: string
) {
  const { data } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('trip_id', tripId)
    .eq('category', category);
  if (!data?.length) return null;
  for (const poi of data) {
    if (!fuzzyMatch(poi.name, name)) continue;
    const poiCity = poi.location?.city;
    // If both have a city value, they must match
    if (city && poiCity && !fuzzyMatch(poiCity, city)) continue;
    return poi;
  }
  return null;
}

function addEmailToSourceRefs(existingRefs: any, emailId: string): any {
  const refs = existingRefs || { email_ids: [], recommendation_ids: [] };
  const emailIds = refs.email_ids || [];
  if (!emailIds.includes(emailId)) emailIds.push(emailId);
  return { ...refs, email_ids: emailIds };
}

/** Returns the actual event date (not the processing date) from the payload. */
function extractEventDate(payload: WebhookPayload): string | null {
  const { metadata } = payload;
  if (metadata.category === 'transportation' && payload.transportation_details?.segments?.length) {
    const dep = payload.transportation_details.segments[0].departure_time;
    if (dep) return dep.split('T')[0];
  }
  if (metadata.category === 'accommodation' && payload.accommodation_details?.checkin_date) {
    return payload.accommodation_details.checkin_date;
  }
  if (metadata.category === 'attraction' && payload.attraction_details?.reservation_date) {
    return payload.attraction_details.reservation_date;
  }
  if (metadata.category === 'eatery' && payload.eatery_details?.reservation_date) {
    return payload.eatery_details.reservation_date;
  }
  return metadata.date || null;
}

// ── Sync sites hierarchy to trip_locations ──────────────────────

async function syncSitesHierarchyToTripLocations(
  supabase: any, tripId: string, hierarchy: SiteNode[],
) {
  const { data: existing } = await supabase
    .from('trip_locations')
    .select('id, name, parent_id')
    .eq('trip_id', tripId);

  const nameToId = new Map<string, string>();
  for (const loc of (existing || [])) {
    nameToId.set((loc.name as string).toLowerCase(), loc.id as string);
  }

  async function walkAndInsert(nodes: SiteNode[], parentId: string | null) {
    for (const node of nodes) {
      const key = node.site.toLowerCase();
      let nodeId = nameToId.get(key);
      if (!nodeId) {
        const { data: inserted } = await supabase
          .from('trip_locations')
          .insert({
            trip_id: tripId, parent_id: parentId,
            name: node.site, site_type: node.site_type, source: 'webhook',
          })
          .select('id').maybeSingle();
        if (inserted) { nodeId = inserted.id as string; nameToId.set(key, nodeId); }
      }
      if (nodeId && node.sub_sites?.length) {
        await walkAndInsert(node.sub_sites, nodeId);
      }
    }
  }
  await walkAndInsert(hierarchy, null);
}

// ── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createSupabaseClient();

    // ── Resolve user from token ──
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    let userId: string | null = null;

    if (token) {
      const result = await validateWebhookToken(supabase, token);
      if (result.valid) userId = result.userId!;
      else {
        return new Response(JSON.stringify({ error: 'Invalid webhook token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: WebhookPayload = await req.json();
    console.log('Received webhook:', JSON.stringify(payload.metadata), 'userId:', userId);

    const { metadata, source_email_info, sites_hierarchy } = payload;
    const action = metadata.action || 'create';

    // ── Dedup by unique email (order_number + date_sent), not just order_number ──
    const emailUniqueId = `${metadata.order_number}::${source_email_info?.date_sent || 'no-date'}`;
    const { data: existingEmail } = await supabase
      .from('source_emails').select('id').eq('email_id', emailUniqueId).maybeSingle();

    if (existingEmail) {
      console.log('Exact same email already processed — saving any new attachments then skipping');
      // Still save attachments even for duplicate emails (e.g. re-forwarded with attachments)
      if (payload.attachments?.length && userId) {
        const { data: existingSrc } = await supabase
          .from('source_emails').select('trip_id').eq('id', existingEmail.id).single();
        const tripId = existingSrc?.trip_id || null;
        const categoryMap: Record<string, string> = {
          transportation: 'flight', accommodation: 'hotel',
          attraction: 'activity', eatery: 'activity',
        };
        const docCategory = categoryMap[metadata.category] || 'other';
        for (const att of payload.attachments) {
          // Skip if already saved (by storage_path)
          const { data: existingDoc } = await supabase
            .from('documents').select('id').eq('storage_path', att.s3_key).maybeSingle();
          if (existingDoc) continue;
          const { error: docErr } = await supabase.from('documents').insert({
            user_id: userId, trip_id: tripId, category: docCategory,
            name: att.filename, file_name: att.filename,
            file_size: att.size, mime_type: att.content_type,
            storage_path: att.s3_key,
            notes: `From email: ${source_email_info?.subject || ''}`,
          });
          if (docErr) console.error('Failed to insert document:', docErr);
          else console.log('Saved document (from duplicate email):', att.filename);
        }
      }
      return new Response(JSON.stringify({ success: true, action: 'duplicate_skipped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Match trip (scoped to user if token provided) ──
    const eventCountries = extractCountries(sites_hierarchy);
    const hierarchyCities = extractCities(sites_hierarchy);
    let matchedTripId: string | null = null;

    const eventDate = extractEventDate(payload);
    if (eventDate && eventCountries.length > 0) {
      let trips;
      if (userId) {
        // Look up trips via trip_members join, filtered by event date range
        const { data: memberRows } = await supabase
          .from('trip_members').select('trip_id, trips(id, countries, start_date, end_date)')
          .eq('user_id', userId);
        trips = (memberRows || [])
          .map((r: any) => r.trips)
          .filter(Boolean)
          .filter((t: any) => t.start_date <= eventDate && t.end_date >= eventDate);
      } else {
        const { data: allTrips } = await supabase
          .from('trips').select('id, countries, start_date, end_date')
          .lte('start_date', eventDate).gte('end_date', eventDate);
        trips = allTrips;
      }
      for (const trip of (trips || [])) {
        const tc = (trip.countries || []).map((c: string) => c.toLowerCase());
        if (eventCountries.some(ec => tc.includes(ec.toLowerCase()))) { matchedTripId = trip.id; break; }
      }
    }
    console.log(`Event date used for matching: ${eventDate}, metadata.date was: ${metadata.date}`);

    console.log(`Trip: ${matchedTripId || 'none'}, Action: ${action}`);

    // ── Store source email ──
    const { data: sourceEmail, error: insertError } = await supabase
      .from('source_emails')
      .insert([{
        email_id: emailUniqueId,
        trip_id: matchedTripId,
        status: matchedTripId ? 'linked' : 'pending',
        source_email_info: source_email_info || {},
        parsed_data: payload,
        linked_entities: [],
      }])
      .select('id').single();

    if (insertError) throw insertError;
    const sourceEmailId = sourceEmail!.id;
    const linkedEntities: Array<{ entity_type: string; entity_id: string; description: string }> = [];

    // ── Process entity (if matched to trip) ──
    if (matchedTripId) {
      const orderNumber = metadata.order_number;
      const firstCountry = eventCountries[0] || undefined;

      // ── CANCEL ──
      if (action === 'cancel') {
        if (metadata.category === 'transportation') {
          const existing = await findExistingTransport(supabase, matchedTripId, orderNumber);
          if (existing) {
            await supabase.from('transportation')
              .update({
                is_cancelled: true,
                source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
              }).eq('id', existing.id);
            // Unlink from itinerary days
            await unlinkTransportFromDays(supabase, matchedTripId, existing.id);
            linkedEntities.push({ entity_type: 'transportation', entity_id: existing.id, description: 'Transportation (cancelled)' });
          }
        } else {
          const existing = await findExistingPoi(supabase, matchedTripId, orderNumber, metadata.category);
          if (existing) {
            await supabase.from('points_of_interest')
              .update({
                is_cancelled: true,
                source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
              }).eq('id', existing.id);
            if (metadata.category === 'accommodation') {
              await unlinkAccommodationFromDays(supabase, matchedTripId, existing.id);
            }
            linkedEntities.push({ entity_type: 'poi', entity_id: existing.id, description: `${metadata.category} (cancelled)` });
          }
        }

      // ── CREATE / UPDATE (upsert) ──
      } else {

        if (metadata.category === 'accommodation' && payload.accommodation_details) {
          const accom = payload.accommodation_details;
          const cost = accom.cost;
          const city = accom.location_details.city || hierarchyCities[0] || undefined;
          const country = accom.location_details.country || firstCountry;

          const newData = {
            category: 'accommodation',
            sub_category: metadata.sub_category || 'hotel',
            name: accom.establishment_name || 'Accommodation',
            status: 'booked',
            is_cancelled: false,
            location: { address: accom.location_details.street, city, country },
            details: {
              cost: cost ? { amount: cost.amount, currency: cost.currency } : undefined,
              order_number: orderNumber,
              accommodation_details: {
                rooms: accom.rooms?.map(r => ({ room_type: r.room_type, occupancy: r.occupancy_details })),
                checkin: { date: accom.checkin_date, hour: accom.checkin_hour },
                checkout: { date: accom.checkout_date, hour: accom.checkout_hour },
                free_cancellation_until: accom.free_cancellation_until ?? null,
                price_per_night: cost && accom.checkin_date && accom.checkout_date
                  ? cost.amount / daysBetween(accom.checkin_date, accom.checkout_date)
                  : cost?.amount,
              },
            },
          };

          let existing = await findExistingPoi(supabase, matchedTripId, orderNumber, 'accommodation');
          if (!existing) {
            existing = await findExistingPoiByNameAndLocation(supabase, matchedTripId, accom.establishment_name, 'accommodation', city);
          }

          if (existing) {
            // UPDATE existing entity
            const merged = {
              ...newData,
              location: mergeWithNewWins(existing.location, newData.location),
              details: mergeWithNewWins(existing.details, newData.details),
              source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
            };
            // Use new name only if provided
            if (!accom.establishment_name) merged.name = existing.name;

            await supabase.from('points_of_interest').update(merged).eq('id', existing.id);
            linkedEntities.push({ entity_type: 'poi', entity_id: existing.id, description: 'Accommodation (updated)' });

            // Fire-and-forget: enrich if still missing coordinates or image
            if (!existing.location?.coordinates?.lat || !existing.image_url) {
              supabase.functions.invoke('fetch-poi-image', { body: {
                poiId: existing.id, name: merged.name || existing.name,
                city: merged.location?.city, country: merged.location?.country, address: merged.location?.address,
              } }).catch((e: unknown) => console.error('[enrich] Accommodation update failed:', e));
            }

            // Re-link itinerary days if dates changed
            const mergedAccom = merged.details?.accommodation_details;
            const newCheckin = mergedAccom?.checkin?.date;
            const newCheckout = mergedAccom?.checkout?.date;
            if (newCheckin && newCheckout) {
              await unlinkAccommodationFromDays(supabase, matchedTripId, existing.id);
              await linkAccommodationToDays(supabase, matchedTripId, existing.id, newCheckin, newCheckout);
            }
          } else {
            // CREATE new entity
            const { data: poi } = await supabase
              .from('points_of_interest')
              .insert([{
                trip_id: matchedTripId,
                ...newData,
                is_paid: payload.metadata.is_paid ?? false,
                source_refs: { email_ids: [sourceEmailId], recommendation_ids: [] },
              }])
              .select('id').single();

            if (poi) {
              linkedEntities.push({ entity_type: 'poi', entity_id: poi.id, description: 'Accommodation' });
              if (accom.checkin_date && accom.checkout_date) {
                await linkAccommodationToDays(supabase, matchedTripId, poi.id, accom.checkin_date, accom.checkout_date);
              }
              // Fire-and-forget: enrich with coordinates + image
              supabase.functions.invoke('fetch-poi-image', { body: {
                poiId: poi.id, name: newData.name,
                city: newData.location?.city, country: newData.location?.country, address: newData.location?.address,
              } }).catch((e: unknown) => console.error('[enrich] Accommodation failed:', e));
            }
          }

        } else if (metadata.category === 'transportation' && payload.transportation_details) {
          const transport = payload.transportation_details;
          const cost = transport.cost;
          const builtSegments = (transport.segments || []).map((s, i) => ({
            segment_id: `seg_${i}`,
            from: s.from, to: s.to,
            departure_time: s.departure_time, arrival_time: s.arrival_time,
            carrier_code: s.carrier, flight_or_vessel_number: s.flight_number,
          }));

          const newData = {
            category: metadata.sub_category?.toLowerCase() || 'flight',
            status: 'booked',
            is_cancelled: false,
            cost: { total_amount: cost?.amount || 0, currency: cost?.currency || 'USD' },
            booking: {
              order_number: orderNumber,
              carrier_name: transport.segments?.[0]?.carrier,
              baggage_allowance: transport.baggage_allowance,
              free_cancellation_until: transport.free_cancellation_until ?? null,
            },
            segments: builtSegments,
            additional_info: {},
          };

          const existing = await findExistingTransport(supabase, matchedTripId, orderNumber);

          if (existing) {
            const merged = {
              ...newData,
              cost: mergeWithNewWins(existing.cost, newData.cost),
              booking: mergeWithNewWins(existing.booking, newData.booking),
              segments: builtSegments.length > 0 ? builtSegments : existing.segments,
              source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
            };

            await supabase.from('transportation').update(merged).eq('id', existing.id);
            linkedEntities.push({ entity_type: 'transportation', entity_id: existing.id, description: 'Transportation (updated)' });

            // Re-link itinerary days
            await unlinkTransportFromDays(supabase, matchedTripId, existing.id);
            await linkTransportSegmentsToDays(supabase, matchedTripId, existing.id,
              builtSegments.map(s => ({ segment_id: s.segment_id, departure_time: s.departure_time }))
            );
          } else {
            const { data: t } = await supabase
              .from('transportation')
              .insert([{
                trip_id: matchedTripId,
                ...newData,
                is_paid: payload.metadata.is_paid ?? true,
                source_refs: { email_ids: [sourceEmailId], recommendation_ids: [] },
              }])
              .select('id').single();

            if (t) {
              linkedEntities.push({ entity_type: 'transportation', entity_id: t.id, description: 'Transportation' });
              await linkTransportSegmentsToDays(supabase, matchedTripId, t.id,
                builtSegments.map(s => ({ segment_id: s.segment_id, departure_time: s.departure_time }))
              );
            }
          }

        } else if (metadata.category === 'attraction' || metadata.category === 'eatery') {
          const isAttraction = metadata.category === 'attraction';
          const details = isAttraction ? payload.attraction_details : payload.eatery_details;

          if (details) {
            const loc = details.location_details;
            const cost = isAttraction && 'cost' in details ? (details as any).cost : undefined;
            const name = isAttraction ? (details as any).attraction_name : (details as any).establishment_name;
            const city = loc?.city || hierarchyCities[0] || undefined;
            const country = loc?.country || firstCountry;

            const newData = {
              category: metadata.category,
              sub_category: isAttraction ? (details as any).attraction_type : 'restaurant',
              name: name || 'Activity',
              status: 'booked',
              is_cancelled: false,
              location: { address: loc?.street, city, country },
              details: {
                cost: cost ? { amount: cost.amount, currency: cost.currency } : undefined,
                order_number: orderNumber,
                free_cancellation_until: (details as any).free_cancellation_until ?? null,
                booking: {
                  reservation_date: (details as any).reservation_date,
                  reservation_hour: (details as any).reservation_hour,
                },
              },
            };

            let existing = await findExistingPoi(supabase, matchedTripId, orderNumber, metadata.category);
            if (!existing) {
              existing = await findExistingPoiByNameAndLocation(supabase, matchedTripId, name, metadata.category, city);
            }

            if (existing) {
              const merged = {
                ...newData,
                location: mergeWithNewWins(existing.location, newData.location),
                details: mergeWithNewWins(existing.details, newData.details),
                source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
              };
              if (!name) merged.name = existing.name;
              await supabase.from('points_of_interest').update(merged).eq('id', existing.id);
              linkedEntities.push({ entity_type: 'poi', entity_id: existing.id, description: `${metadata.category} (updated)` });

              // Fire-and-forget: enrich if still missing coordinates or image
              if (!existing.location?.coordinates?.lat || !existing.image_url) {
                supabase.functions.invoke('fetch-poi-image', { body: {
                  poiId: existing.id, name: merged.name || existing.name,
                  city: merged.location?.city, country: merged.location?.country, address: merged.location?.address,
                } }).catch((e: unknown) => console.error('[enrich] POI update failed:', e));
              }
            } else {
              const { data: poi } = await supabase
                .from('points_of_interest')
                .insert([{
                  trip_id: matchedTripId,
                  ...newData,
                  is_paid: payload.metadata.is_paid ?? false,
                  source_refs: { email_ids: [sourceEmailId], recommendation_ids: [] },
                }])
                .select('id').single();
              if (poi) {
                linkedEntities.push({ entity_type: 'poi', entity_id: poi.id, description: isAttraction ? 'Attraction' : 'Eatery' });
                // Fire-and-forget: enrich with coordinates + image
                supabase.functions.invoke('fetch-poi-image', { body: {
                  poiId: poi.id, name: newData.name,
                  city: newData.location?.city, country: newData.location?.country, address: newData.location?.address,
                } }).catch((e: unknown) => console.error('[enrich] POI failed:', e));
              }
            }
          }
        }
      }

      // Sync sites_hierarchy into trip_locations table
      if (sites_hierarchy && sites_hierarchy.length > 0) {
        try {
          await syncSitesHierarchyToTripLocations(supabase, matchedTripId, sites_hierarchy);
        } catch (e) {
          console.error('Failed to sync sites hierarchy to trip_locations:', e);
        }
      }

      // Update source_email with linked entities
      if (linkedEntities.length > 0) {
        await supabase.from('source_emails').update({ linked_entities: linkedEntities }).eq('id', sourceEmailId);
      }

      // Send push + WhatsApp notifications to all trip members (fire-and-forget)
      const { data: members } = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', matchedTripId);
      if (members?.length) {
        const entityName = linkedEntities[0]?.description || metadata.category;
        const subject = source_email_info?.subject || entityName;
        const actionLabel = action === 'cancel' ? 'Cancelled' : linkedEntities.some(e => e.description.includes('updated')) ? 'Updated' : 'New';
        const categoryLabel = metadata.category === 'transportation' ? 'transport' : metadata.category;

        const title = `${actionLabel} ${categoryLabel}`;
        const body = `${subject}`;

        fetch(new URL('/functions/v1/send-notification', Deno.env.get('SUPABASE_URL')!).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({
            user_ids: members.map(m => m.user_id),
            title,
            body,
            url: '/inbox',
            tag: `email-${sourceEmailId}`,
          }),
        }).catch(e => console.error('Push notification failed:', e));

        fetch(new URL('/functions/v1/whatsapp-notify', Deno.env.get('SUPABASE_URL')!).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({
            user_ids: members.map(m => m.user_id),
            type: 'booking_confirmed',
            text: `📧 ${title}: ${body}`,
            template_name: 'booking_confirmed',
            template_params: [title, body],
          }),
        }).catch(e => console.error('WhatsApp notification failed:', e));
      }
    }

    // ── Save attachments to documents table (regardless of trip match) ──
    if (payload.attachments?.length && userId) {
      const categoryMap: Record<string, string> = {
        transportation: 'flight', accommodation: 'hotel',
        attraction: 'activity', eatery: 'activity',
      };
      const docCategory = categoryMap[metadata.category] || 'other';

      for (const att of payload.attachments) {
        // Skip if already saved (by storage_path)
        const { data: existingDoc } = await supabase
          .from('documents').select('id').eq('storage_path', att.s3_key).maybeSingle();
        if (existingDoc) continue;
        const { error: docErr } = await supabase.from('documents').insert({
          user_id: userId,
          trip_id: matchedTripId,
          category: docCategory,
          name: att.filename,
          file_name: att.filename,
          file_size: att.size,
          mime_type: att.content_type,
          storage_path: att.s3_key,
          notes: `From email: ${source_email_info?.subject || ''}`,
        });
        if (docErr) console.error('Failed to insert document:', docErr);
        else console.log('Saved document:', att.filename);
      }
    }

    return new Response(JSON.stringify({
      success: true, source_email_id: sourceEmailId, action,
      matched: !!matchedTripId, trip_id: matchedTripId,
      linked_entities: linkedEntities, status: matchedTripId ? 'linked' : 'pending',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
