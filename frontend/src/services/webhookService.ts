import { supabase } from '@/integrations/supabase/client';
import { SourceEmail } from '@/types/webhook';
import { ensureItineraryDayForDate } from '@/services/itineraryDayService';

// ── Helpers ──────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
}

/** Deep merge: newer non-null/non-undefined values win. Arrays replaced entirely. */
function deepMerge(old: any, incoming: any): any {
  if (incoming === null || incoming === undefined) return old;
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  if (typeof old !== 'object' || old === null || Array.isArray(old)) return incoming;
  const result = { ...old };
  for (const key of Object.keys(incoming)) {
    if (incoming[key] !== undefined) {
      result[key] = deepMerge(old[key], incoming[key]);
    }
  }
  return result;
}

function addEmailToSourceRefs(existingRefs: any, emailId: string): any {
  const refs = existingRefs || { email_ids: [], recommendation_ids: [] };
  const emailIds = refs.email_ids || [];
  if (!emailIds.includes(emailId)) emailIds.push(emailId);
  return { ...refs, email_ids: emailIds };
}

async function findExistingPoi(tripId: string, orderNumber: string, category: string) {
  const { data } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('trip_id', tripId)
    .eq('category', category)
    .contains('details', { order_number: orderNumber });
  return data?.[0] || null;
}

async function findExistingTransport(tripId: string, orderNumber: string) {
  const { data } = await supabase
    .from('transportation')
    .select('*')
    .eq('trip_id', tripId)
    .contains('booking', { order_number: orderNumber });
  return data?.[0] || null;
}

async function unlinkAccommodationFromDays(tripId: string, poiId: string) {
  const { data: days } = await supabase.from('itinerary_days').select('id, accommodation_options').eq('trip_id', tripId);
  for (const day of (days || [])) {
    const opts = (day.accommodation_options || []) as any[];
    const filtered = opts.filter((a: any) => a.poi_id !== poiId);
    if (filtered.length !== opts.length) {
      await supabase.from('itinerary_days').update({ accommodation_options: filtered }).eq('id', day.id);
    }
  }
}

async function unlinkTransportFromDays(tripId: string, transportId: string) {
  const { data: days } = await supabase.from('itinerary_days').select('id, transportation_segments').eq('trip_id', tripId);
  for (const day of (days || [])) {
    const segs = (day.transportation_segments || []) as any[];
    const filtered = segs.filter((s: any) => s.transportation_id !== transportId);
    if (filtered.length !== segs.length) {
      await supabase.from('itinerary_days').update({ transportation_segments: filtered }).eq('id', day.id);
    }
  }
}

async function linkAccommodationToDays(tripId: string, poiId: string, checkin: string, checkout: string) {
  const { data: existingDays } = await supabase
    .from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number', { ascending: true });
  const days = existingDays || [];
  const msPerDay = 86400000;
  const toUtcMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

  for (let ms = toUtcMs(checkin); ms < toUtcMs(checkout); ms += msPerDay) {
    const nightDate = new Date(ms).toISOString().split('T')[0];
    let matchingDay = days.find(d => d.date === nightDate);
    if (!matchingDay) {
      const created = await ensureItineraryDayForDate(tripId, nightDate);
      if (created) { matchingDay = created as any; days.push(matchingDay); }
    }
    if (matchingDay) {
      const opts = (matchingDay.accommodation_options as any[]) || [];
      if (!opts.some((a: any) => a.poi_id === poiId)) {
        opts.push({ is_selected: true, poi_id: poiId });
        await supabase.from('itinerary_days').update({ accommodation_options: opts }).eq('id', matchingDay.id);
      }
    }
  }
}

async function linkTransportSegmentsToDays(
  tripId: string, transportId: string, segments: Array<{ segment_id: string; departure_time?: string }>
) {
  const { data: existingDays } = await supabase
    .from('itinerary_days').select('*').eq('trip_id', tripId).order('day_number', { ascending: true });
  const days = existingDays || [];

  for (const seg of segments) {
    if (!seg.departure_time) continue;
    const depDate = seg.departure_time.split('T')[0];
    let matchingDay = days.find(d => d.date === depDate);
    if (!matchingDay) {
      const created = await ensureItineraryDayForDate(tripId, depDate);
      if (created) { matchingDay = created as any; days.push(matchingDay); }
    }
    if (matchingDay) {
      const segs = (matchingDay.transportation_segments as any[]) || [];
      if (!segs.some((s: any) => s.transportation_id === transportId && s.segment_id === seg.segment_id)) {
        segs.push({ is_selected: true, transportation_id: transportId, segment_id: seg.segment_id });
        await supabase.from('itinerary_days').update({ transportation_segments: segs }).eq('id', matchingDay.id);
        // Keep in-memory object current so same-day segments don't overwrite each other
        (matchingDay as any).transportation_segments = segs;
      }
    }
  }
}

// ── Source Emails CRUD ───────────────────────────────────────────

export async function fetchSourceEmails(status?: 'pending' | 'linked' | 'cancelled'): Promise<SourceEmail[]> {
  let query = supabase.from('source_emails').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapSourceEmail);
}

export async function fetchTripSourceEmails(tripId: string): Promise<SourceEmail[]> {
  const { data, error } = await supabase
    .from('source_emails').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSourceEmail);
}

export async function deleteSourceEmail(id: string): Promise<void> {
  const { error } = await supabase.from('source_emails').delete().eq('id', id);
  if (error) throw error;
}

// ── Link source email to trip (upsert / cancel logic) ────────────

export async function linkSourceEmailToTrip(sourceEmailId: string, tripId: string): Promise<void> {
  const { data: item, error: fetchError } = await supabase
    .from('source_emails').select('*').eq('id', sourceEmailId).single();
  if (fetchError || !item) throw new Error('Source email not found');

  const parsedData = item.parsed_data as SourceEmail['parsedData'];
  const metadata = parsedData?.metadata;
  const category = metadata?.category;
  const action = metadata?.action || 'create';
  const orderNumber = metadata?.order_number;
  const linkedEntities: Array<{ entity_type: string; entity_id: string; description: string }> = [];

  // Extract location from hierarchy
  const sitesHierarchy = parsedData?.sites_hierarchy as Array<{ site: string; site_type: string; sub_sites?: any[] }> | undefined;
  const hierarchyCountries: string[] = [];
  const hierarchyCities: string[] = [];
  function walkHierarchy(nodes?: Array<{ site: string; site_type: string; sub_sites?: any[] }>) {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.site_type === 'country') hierarchyCountries.push(node.site);
      if (['city', 'town', 'village'].includes(node.site_type)) hierarchyCities.push(node.site);
      if (node.sub_sites) walkHierarchy(node.sub_sites);
    }
  }
  walkHierarchy(sitesHierarchy);

  // ── CANCEL ──
  if (action === 'cancel' && orderNumber) {
    if (category === 'transportation') {
      const existing = await findExistingTransport(tripId, orderNumber);
      if (existing) {
        await supabase.from('transportation').update({
          is_cancelled: true,
          source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
        }).eq('id', existing.id);
        await unlinkTransportFromDays(tripId, existing.id);
        linkedEntities.push({ entity_type: 'transportation', entity_id: existing.id, description: 'Transportation (cancelled)' });
      }
    } else if (category) {
      const existing = await findExistingPoi(tripId, orderNumber, category);
      if (existing) {
        await supabase.from('points_of_interest').update({
          is_cancelled: true,
          source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
        }).eq('id', existing.id);
        if (category === 'accommodation') await unlinkAccommodationFromDays(tripId, existing.id);
        linkedEntities.push({ entity_type: 'poi', entity_id: existing.id, description: `${category} (cancelled)` });
      }
    }

  // ── CREATE / UPDATE (upsert) ──
  } else {

    if (category === 'accommodation' && parsedData.accommodation_details) {
      const accom = parsedData.accommodation_details as Record<string, unknown>;
      const locationDetails = accom.location_details as Record<string, string> | undefined;
      const cost = accom.cost as { amount: number; currency: string } | undefined;
      const rooms = accom.rooms as Array<{ room_type?: string; occupancy_details?: string }> | undefined;
      const checkinDate = accom.checkin_date as string | undefined;
      const checkoutDate = accom.checkout_date as string | undefined;
      const checkinHour = accom.checkin_hour as string | undefined;
      const checkoutHour = accom.checkout_hour as string | undefined;
      const city = locationDetails?.city || hierarchyCities[0] || undefined;
      const country = locationDetails?.country || hierarchyCountries[0] || undefined;

      const newData = {
        category: 'accommodation' as const,
        sub_category: metadata?.sub_category || 'hotel',
        name: (accom.establishment_name as string) || 'Accommodation',
        status: 'booked',
        is_cancelled: false,
        location: { address: locationDetails?.street, city, country },
        details: {
          cost: cost ? { amount: cost.amount, currency: cost.currency } : undefined,
          order_number: orderNumber,
          accommodation_details: {
            rooms: rooms?.map(r => ({ room_type: r.room_type, occupancy: r.occupancy_details })),
            checkin: { date: checkinDate, hour: checkinHour },
            checkout: { date: checkoutDate, hour: checkoutHour },
            price_per_night: cost && checkinDate && checkoutDate
              ? cost.amount / daysBetween(checkinDate, checkoutDate)
              : cost?.amount,
          },
        },
      };

      const existing = orderNumber ? await findExistingPoi(tripId, orderNumber, 'accommodation') : null;

      if (existing) {
        const merged = {
          ...newData,
          location: deepMerge(existing.location, newData.location),
          details: deepMerge(existing.details, newData.details),
          source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
        };
        if (!accom.establishment_name) merged.name = existing.name;
        await supabase.from('points_of_interest').update(merged).eq('id', existing.id);
        linkedEntities.push({ entity_type: 'poi', entity_id: existing.id, description: 'Accommodation (updated)' });

        const mergedAccom = merged.details?.accommodation_details;
        const newCheckin = mergedAccom?.checkin?.date;
        const newCheckout = mergedAccom?.checkout?.date;
        if (newCheckin && newCheckout) {
          await unlinkAccommodationFromDays(tripId, existing.id);
          await linkAccommodationToDays(tripId, existing.id, newCheckin, newCheckout);
        }
      } else {
        const { data: poi } = await supabase
          .from('points_of_interest')
          .insert([{ trip_id: tripId, ...newData, source_refs: { email_ids: [sourceEmailId], recommendation_ids: [] } }])
          .select('id').single();
        if (poi) {
          linkedEntities.push({ entity_type: 'poi', entity_id: poi.id, description: 'Accommodation' });
          if (checkinDate && checkoutDate) {
            await linkAccommodationToDays(tripId, poi.id, checkinDate, checkoutDate);
          }
        }
      }

    } else if (category === 'transportation' && parsedData.transportation_details) {
      const transport = parsedData.transportation_details as Record<string, unknown>;
      const cost = transport.cost as { amount: number; currency: string } | undefined;
      const segments = transport.segments as TransportSegmentRaw[] | undefined;
      const baggage = transport.baggage_allowance as { cabin_bag?: string; checked_bag?: string } | undefined;

      const builtSegments = (segments || []).map((s, i) => ({
        segment_id: `seg_${i}`,
        from: s.from, to: s.to,
        departure_time: s.departure_time, arrival_time: s.arrival_time,
        carrier_code: s.carrier, flight_or_vessel_number: s.flight_number,
      }));

      const newData = {
        category: metadata?.sub_category?.toLowerCase() || 'flight',
        status: 'booked',
        is_cancelled: false,
        cost: { total_amount: cost?.amount || 0, currency: cost?.currency || 'USD' },
        booking: {
          order_number: orderNumber,
          carrier_name: segments?.[0]?.carrier,
          baggage_allowance: baggage,
        },
        segments: builtSegments,
        additional_info: {},
      };

      const existing = orderNumber ? await findExistingTransport(tripId, orderNumber) : null;

      if (existing) {
        const merged = {
          ...newData,
          cost: deepMerge(existing.cost, newData.cost),
          booking: deepMerge(existing.booking, newData.booking),
          segments: builtSegments.length > 0 ? builtSegments : existing.segments,
          source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
        };
        await supabase.from('transportation').update(merged).eq('id', existing.id);
        linkedEntities.push({ entity_type: 'transportation', entity_id: existing.id, description: 'Transportation (updated)' });

        await unlinkTransportFromDays(tripId, existing.id);
        await linkTransportSegmentsToDays(tripId, existing.id,
          builtSegments.map(s => ({ segment_id: s.segment_id, departure_time: s.departure_time }))
        );
      } else {
        const { data: t } = await supabase
          .from('transportation')
          .insert([{ trip_id: tripId, ...newData, source_refs: { email_ids: [sourceEmailId], recommendation_ids: [] } }])
          .select('id').single();
        if (t) {
          linkedEntities.push({ entity_type: 'transportation', entity_id: t.id, description: 'Transportation' });
          await linkTransportSegmentsToDays(tripId, t.id,
            builtSegments.map(s => ({ segment_id: s.segment_id, departure_time: s.departure_time }))
          );
        }
      }

    } else if ((category === 'attraction' || category === 'eatery')) {
      const isAttraction = category === 'attraction';
      const details = isAttraction
        ? parsedData.attraction_details as Record<string, unknown>
        : parsedData.eatery_details as Record<string, unknown>;

      if (details) {
        const locationDetails = details.location_details as Record<string, string> | undefined;
        const cost = isAttraction ? (details.cost as { amount: number; currency: string } | undefined) : undefined;
        const name = (isAttraction ? details.attraction_name : details.establishment_name) as string;
        const city = locationDetails?.city || hierarchyCities[0] || undefined;
        const country = locationDetails?.country || hierarchyCountries[0] || undefined;

        const newData = {
          category: category as string,
          sub_category: isAttraction ? (details.attraction_type as string) : 'restaurant',
          name: name || 'Activity',
          status: 'booked',
          is_cancelled: false,
          location: { address: locationDetails?.street, city, country },
          details: {
            cost: cost ? { amount: cost.amount, currency: cost.currency } : undefined,
            order_number: orderNumber,
            booking: {
              reservation_date: (details.reservation_date as string) || undefined,
              reservation_hour: (details.reservation_hour as string) || undefined,
            },
          },
        };

        const existing = orderNumber ? await findExistingPoi(tripId, orderNumber, category) : null;

        if (existing) {
          const merged = {
            ...newData,
            location: deepMerge(existing.location, newData.location),
            details: deepMerge(existing.details, newData.details),
            source_refs: addEmailToSourceRefs(existing.source_refs, sourceEmailId),
          };
          if (!name) merged.name = existing.name;
          await supabase.from('points_of_interest').update(merged).eq('id', existing.id);
          linkedEntities.push({ entity_type: 'poi', entity_id: existing.id, description: `${category} (updated)` });
        } else {
          const { data: poi } = await supabase
            .from('points_of_interest')
            .insert([{ trip_id: tripId, ...newData, source_refs: { email_ids: [sourceEmailId], recommendation_ids: [] } }])
            .select('id').single();
          if (poi) linkedEntities.push({ entity_type: 'poi', entity_id: poi.id, description: isAttraction ? 'Attraction' : 'Eatery' });
        }
      }
    }
  }

  // Update source email
  await supabase
    .from('source_emails')
    .update({ trip_id: tripId, linked_entities: linkedEntities, status: 'linked' })
    .eq('id', sourceEmailId);
}

// ── Types & Mapper ───────────────────────────────────────────────

interface TransportSegmentRaw {
  from: { name: string; code?: string; address?: { street?: string; city?: string; country?: string } };
  to: { name: string; code?: string; address?: { street?: string; city?: string; country?: string } };
  carrier?: string;
  flight_number?: string;
  departure_time: string;
  arrival_time: string;
}

function mapSourceEmail(row: Record<string, unknown>): SourceEmail {
  return {
    id: row.id as string,
    tripId: (row.trip_id as string) || undefined,
    emailId: (row.email_id as string) || undefined,
    sourceEmailInfo: (row.source_email_info as SourceEmail['sourceEmailInfo']) || {},
    parsedData: (row.parsed_data as SourceEmail['parsedData']) || {},
    linkedEntities: (row.linked_entities as SourceEmail['linkedEntities']) || [],
    status: (row.status as SourceEmail['status']) || 'pending',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
