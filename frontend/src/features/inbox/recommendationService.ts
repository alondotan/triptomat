import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { SourceRecommendation, SiteHierarchyNode } from '@/types/webhook';
import type { SourceRefs } from '@/types/trip';
import { isSourceRefsEmpty } from '@/shared/services/helpers';
import { getTypeToCategoryMap, getGeoTypes, getTipTypes } from '@/shared/lib/subCategoryConfig';

function buildSiteToCountryMap(hierarchy: SiteHierarchyNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of hierarchy) {
    if (node.site_type === 'country') {
      collectSitesUnderCountry(node, node.site, map);
    }
  }
  return map;
}

function collectSitesUnderCountry(node: SiteHierarchyNode, country: string, map: Record<string, string>) {
  map[node.site.toLowerCase()] = country;
  if (node.sub_sites) {
    for (const sub of node.sub_sites) {
      collectSitesUnderCountry(sub, country, map);
    }
  }
}

export async function fetchRecommendations(tripId?: string): Promise<SourceRecommendation[]> {
  let query = supabase
    .from('source_recommendations')
    .select('*')
    .order('created_at', { ascending: false });

  if (tripId) {
    query = query.eq('trip_id', tripId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapRecommendation);
}

export async function fetchTripRecommendations(tripId: string): Promise<SourceRecommendation[]> {
  return fetchRecommendations(tripId);
}

export async function fetchPendingRecommendations(): Promise<SourceRecommendation[]> {
  const { data, error } = await supabase
    .from('source_recommendations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapRecommendation);
}

export async function linkRecommendationToTrip(
  recommendationId: string,
  tripId: string
): Promise<void> {
  // Fetch the recommendation
  const { data: rec, error: fetchError } = await supabase
    .from('source_recommendations')
    .select('*')
    .eq('id', recommendationId)
    .single();

  if (fetchError || !rec) throw new Error('Recommendation not found');

  const analysis = rec.analysis as SourceRecommendation['analysis'];
  const rawAnalysis = rec.analysis as Record<string, unknown>;
  const extractedItems = analysis?.extracted_items || [];
  const siteToCountry = buildSiteToCountryMap((rawAnalysis?.sites_hierarchy as SiteHierarchyNode[]) || []);
  const linkedEntities: Array<{ entity_type: string; entity_id: string; description: string; matched_existing: boolean }> = [];

  // Pre-fetch existing entities for this trip
  const [{ data: existingPois }, { data: existingTransport }, { data: existingContacts }] = await Promise.all([
    supabase.from('points_of_interest').select('id, name, category, source_refs').eq('trip_id', tripId),
    supabase.from('transportation').select('id, category, additional_info, source_refs').eq('trip_id', tripId),
    supabase.from('contacts').select('id, name, role').eq('trip_id', tripId),
  ]);

  // Category mappings derived from config.json (single source of truth)
  const TYPE_TO_CATEGORY = getTypeToCategoryMap();
  const GEO_TYPES = getGeoTypes();
  const TIP_TYPES = getTipTypes();

  for (const item of extractedItems) {
    const itemType = item.category;
    if (GEO_TYPES.has(itemType) || TIP_TYPES.has(itemType) || item.sentiment === 'bad') continue;

    const dbCategory = TYPE_TO_CATEGORY[itemType];
    if (!dbCategory) continue;

    if (dbCategory === 'transportation') {
      const matchedTransport = existingTransport?.find(t => {
        const info = t.additional_info as Record<string, unknown> | null;
        const existingName = (info?.name as string) || '';
        return existingName && fuzzyMatch(existingName, item.name);
      });

      if (matchedTransport) {
        const refs = (matchedTransport.source_refs as Record<string, unknown>) || {};
        const recIds = (refs.recommendation_ids as string[]) || [];
        if (!recIds.includes(recommendationId)) {
          await supabase.from('transportation').update({
            source_refs: { ...refs, recommendation_ids: [...recIds, recommendationId] } as unknown as Json,
          }).eq('id', matchedTransport.id);
        }
        linkedEntities.push({ entity_type: 'transportation', entity_id: matchedTransport.id, description: item.name, matched_existing: true });
      } else {
        const { data: newT } = await supabase.from('transportation').insert([{
          trip_id: tripId, category: itemType, status: 'suggested',
          source_refs: { email_ids: [], recommendation_ids: [recommendationId] } as unknown as Json,
          cost: { total_amount: 0, currency: 'USD' } as unknown as Json,
          booking: {} as unknown as Json,
          segments: [] as unknown as Json,
          additional_info: { name: item.name, from_recommendation: true, paragraph: item.paragraph, site: item.site } as unknown as Json,
        }]).select('id').single();
        if (newT) linkedEntities.push({ entity_type: 'transportation', entity_id: newT.id, description: item.name, matched_existing: false });
      }
    } else {
      const poiCategory = dbCategory;
      const matchedPoi = existingPois?.find(p => p.category === poiCategory && fuzzyMatch(p.name, item.name));

      if (matchedPoi) {
        const refs = (matchedPoi.source_refs as Record<string, unknown>) || {};
        const recIds = (refs.recommendation_ids as string[]) || [];
        if (!recIds.includes(recommendationId)) {
          await supabase.from('points_of_interest').update({
            source_refs: { ...refs, recommendation_ids: [...recIds, recommendationId] } as unknown as Json,
          }).eq('id', matchedPoi.id);
        }
        linkedEntities.push({ entity_type: 'poi', entity_id: matchedPoi.id, description: item.name, matched_existing: true });
      } else {
        const { data: newPoi } = await supabase.from('points_of_interest').insert([{
          trip_id: tripId, category: poiCategory, sub_category: itemType, name: item.name,
          status: 'suggested',
          location: { country: siteToCountry[(item.site || '').toLowerCase()] || undefined, city: item.site } as unknown as Json,
          source_refs: { email_ids: [], recommendation_ids: [recommendationId] } as unknown as Json,
          details: { from_recommendation: true, paragraph: item.paragraph, source_url: rec.source_url } as unknown as Json,
        }]).select('id').single();
        if (newPoi) linkedEntities.push({ entity_type: 'poi', entity_id: newPoi.id, description: item.name, matched_existing: false });
      }
    }
  }

  // Process contacts from the analysis
  const analysisContacts = analysis?.contacts || [];
  for (const contact of analysisContacts) {
    if (!contact.name) continue;

    const matchedContact = existingContacts?.find(c => fuzzyMatch(c.name, contact.name));

    if (matchedContact) {
      linkedEntities.push({ entity_type: 'contact', entity_id: matchedContact.id, description: contact.name, matched_existing: true });
    } else {
      const ROLE_MAP: Record<string, string> = {
        guide: 'guide', host: 'host', rental: 'rental',
        restaurant: 'restaurant', driver: 'driver', agency: 'agency',
      };
      const role = ROLE_MAP[contact.role || ''] || 'other';

      const { data: newContact } = await supabase.from('contacts').insert([{
        trip_id: tripId,
        name: contact.name,
        role,
        phone: contact.phone || null,
        email: contact.email || null,
        website: contact.website || null,
        address: contact.address || null,
        notes: contact.paragraph || null,
      }]).select('id').single();

      if (newContact) {
        linkedEntities.push({ entity_type: 'contact', entity_id: newContact.id, description: contact.name, matched_existing: false });
      }
    }
  }

  // Update source_recommendation
  await supabase.from('source_recommendations').update({
    trip_id: tripId,
    linked_entities: linkedEntities as unknown as Json,
    status: 'linked',
  }).eq('id', recommendationId);
}

export async function deleteRecommendation(id: string): Promise<void> {
  // Fetch the recommendation to get linked_entities
  const { data: rec, error: fetchError } = await supabase
    .from('source_recommendations')
    .select('linked_entities')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const linkedEntities = (rec?.linked_entities as Array<{
    entity_type: string;
    entity_id: string;
    matched_existing?: boolean;
  }>) || [];

  // Process each linked entity: remove this recommendation from source_refs,
  // and delete the entity if it has no remaining sources
  const poiEntities = linkedEntities.filter(e => e.entity_type === 'poi');
  const transportEntities = linkedEntities.filter(e => e.entity_type === 'transportation');
  const newContactEntities = linkedEntities.filter(e => e.entity_type === 'contact' && !e.matched_existing);

  // Handle POIs
  if (poiEntities.length > 0) {
    const poiIds = poiEntities.map(e => e.entity_id);
    const { data: pois } = await supabase
      .from('points_of_interest')
      .select('id, source_refs')
      .in('id', poiIds);

    if (pois) {
      const toDelete: string[] = [];
      const toUpdate: Array<{ id: string; source_refs: SourceRefs }> = [];

      for (const poi of pois) {
        const refs = (poi.source_refs as unknown as SourceRefs) || {} as SourceRefs;
        const updated: SourceRefs = {
          email_ids: refs.email_ids || [],
          recommendation_ids: (refs.recommendation_ids || []).filter(rid => rid !== id),
          map_list_ids: refs.map_list_ids || [],
        };

        if (isSourceRefsEmpty(updated)) {
          toDelete.push(poi.id);
        } else {
          toUpdate.push({ id: poi.id, source_refs: updated });
        }
      }

      await Promise.all([
        toDelete.length > 0
          ? supabase.from('points_of_interest').delete().in('id', toDelete)
          : Promise.resolve(),
        ...toUpdate.map(u =>
          supabase.from('points_of_interest').update({
            source_refs: u.source_refs as unknown as Json,
          }).eq('id', u.id)
        ),
      ]);
    }
  }

  // Handle transportation
  if (transportEntities.length > 0) {
    const transportIds = transportEntities.map(e => e.entity_id);
    const { data: transports } = await supabase
      .from('transportation')
      .select('id, source_refs')
      .in('id', transportIds);

    if (transports) {
      const toDelete: string[] = [];
      const toUpdate: Array<{ id: string; source_refs: SourceRefs }> = [];

      for (const t of transports) {
        const refs = (t.source_refs as unknown as SourceRefs) || {} as SourceRefs;
        const updated: SourceRefs = {
          email_ids: refs.email_ids || [],
          recommendation_ids: (refs.recommendation_ids || []).filter(rid => rid !== id),
          map_list_ids: refs.map_list_ids || [],
        };

        if (isSourceRefsEmpty(updated)) {
          toDelete.push(t.id);
        } else {
          toUpdate.push({ id: t.id, source_refs: updated });
        }
      }

      await Promise.all([
        toDelete.length > 0
          ? supabase.from('transportation').delete().in('id', toDelete)
          : Promise.resolve(),
        ...toUpdate.map(u =>
          supabase.from('transportation').update({
            source_refs: u.source_refs as unknown as Json,
          }).eq('id', u.id)
        ),
      ]);
    }
  }

  // Delete contacts that were created new (not matched to existing)
  if (newContactEntities.length > 0) {
    const contactIds = newContactEntities.map(e => e.entity_id);
    await supabase.from('contacts').delete().in('id', contactIds);
  }

  // Finally, delete the recommendation itself
  const { error } = await supabase.from('source_recommendations').delete().eq('id', id);
  if (error) throw error;
}

function fuzzyMatch(existingName: string, newName: string): boolean {
  const a = existingName.toLowerCase().trim();
  const b = newName.toLowerCase().trim();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function mapRecommendation(row: Record<string, unknown>): SourceRecommendation {
  return {
    id: row.id as string,
    tripId: (row.trip_id as string) || undefined,
    recommendationId: (row.recommendation_id as string) || undefined,
    timestamp: (row.timestamp as string) || undefined,
    sourceUrl: (row.source_url as string) || undefined,
    sourceTitle: (row.source_title as string) || undefined,
    sourceImage: (row.source_image as string) || undefined,
    analysis: (row.analysis as SourceRecommendation['analysis']) || {},
    linkedEntities: (row.linked_entities as SourceRecommendation['linkedEntities']) || [],
    status: (row.status as SourceRecommendation['status']) || 'pending',
    error: (row.error as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}