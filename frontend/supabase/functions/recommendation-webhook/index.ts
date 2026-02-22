import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Category mapping: extracted_item.category (type) → DB entity category
const TYPE_TO_CATEGORY: Record<string, string> = {
  // Accommodations → poi.category = 'accommodation'
  hotel: 'accommodation', glamping: 'accommodation', hostel: 'accommodation', villa: 'accommodation',
  resort: 'accommodation', apartment: 'accommodation', guesthouse: 'accommodation',
  bedAndBreakfast: 'accommodation', motel: 'accommodation', lodge: 'accommodation',
  ecoLodge: 'accommodation', boutiqueHotel: 'accommodation', capsuleHotel: 'accommodation',
  ryokan: 'accommodation', homestay: 'accommodation', farmStay: 'accommodation',
  cottage: 'accommodation', chalet: 'accommodation', bungalow: 'accommodation',
  treehouse: 'accommodation', houseboat: 'accommodation', campground: 'accommodation',
  campingTent: 'accommodation', rvPark: 'accommodation', servicedApartment: 'accommodation',
  longStayHotel: 'accommodation', luxuryHotel: 'accommodation', budgetHotel: 'accommodation',
  otherAccommodation: 'accommodation',

  // Eateries → poi.category = 'eatery'
  restaurant: 'eatery', cafe: 'eatery', bakery: 'eatery', deli: 'eatery',
  bistro: 'eatery', diner: 'eatery', foodTruck: 'eatery', foodCourt: 'eatery',
  buffet: 'eatery', iceCreamParlor: 'eatery', juiceBar: 'eatery', pub: 'eatery',
  bar: 'eatery', tavern: 'eatery', wineBar: 'eatery', brewpub: 'eatery',
  sushiBar: 'eatery', teahouse: 'eatery', steakhouse: 'eatery', tapasBar: 'eatery',
  doughnutShop: 'eatery', dessertBar: 'eatery', streetFood: 'eatery',
  rooftopBar: 'eatery', brunchSpot: 'eatery', speakeasy: 'eatery',
  fineDining: 'eatery', localCuisine: 'eatery', veganRestaurant: 'eatery',
  vegetarianRestaurant: 'eatery', seafoodRestaurant: 'eatery', familyRestaurant: 'eatery',
  otherEatery: 'eatery',

  // Transportation → transportation entity
  car: 'transportation', bus: 'transportation', train: 'transportation', subway: 'transportation',
  bicycle: 'transportation', motorcycle: 'transportation', taxi: 'transportation',
  ferry: 'transportation', airplane: 'transportation', scooter: 'transportation',
  cruise: 'transportation', tram: 'transportation', cruiseShip: 'transportation',
  carRental: 'transportation', domesticFlight: 'transportation', internationalFlight: 'transportation',
  nightTrain: 'transportation', highSpeedTrain: 'transportation', cableCar: 'transportation',
  funicular: 'transportation', boatTaxi: 'transportation', rideshare: 'transportation',
  privateTransfer: 'transportation', otherTransportation: 'transportation',

  // Activities → poi.category = 'attraction'
  market: 'attraction', park: 'attraction', landmark: 'attraction', natural: 'attraction',
  historical: 'attraction', cultural: 'attraction', amusement: 'attraction', beach: 'attraction',
  mountain: 'attraction', wildlife: 'attraction', adventure: 'attraction', religious: 'attraction',
  architectural: 'attraction', underwater: 'attraction', nationalPark: 'attraction',
  scenic: 'attraction', museum: 'attraction', shopping: 'attraction', zoo: 'attraction',
  themePark: 'attraction', botanicalGarden: 'attraction', sports: 'attraction',
  music: 'attraction', art: 'attraction', nightlife: 'attraction', spa: 'attraction',
  casino: 'attraction', viewpoint: 'attraction', hikingTrail: 'attraction',
  extremeSports: 'attraction', hiddenGem: 'attraction', beachClub: 'attraction',
  stargazing: 'attraction', streetArt: 'attraction', photographySpot: 'attraction',
  temple: 'attraction', boatTour: 'attraction', playground: 'attraction',
  walkingTour: 'attraction', shoppingMall: 'attraction', historicSite: 'attraction',
  waterPark: 'attraction', skiResort: 'attraction', vineyard: 'attraction',
  brewery: 'attraction', movieTheater: 'attraction', concertHall: 'attraction',
  botanicalPark: 'attraction', fishingSpot: 'attraction', birdSanctuary: 'attraction',
  zipLine: 'attraction', hotSpring: 'attraction', canyon: 'attraction',
  volcano: 'attraction', observatory: 'attraction', lighthouse: 'attraction',
  artGallery: 'attraction', aquarium: 'attraction', cave: 'attraction',
  waterfall: 'attraction', airport: 'transportation', transit_hub: 'attraction',
  snorkeling: 'attraction', diving: 'attraction', surfing: 'attraction',
  kayakingActivity: 'attraction', rafting: 'attraction', climbing: 'attraction',
  trekking: 'attraction', jeepTour: 'attraction', safari: 'attraction',
  foodTour: 'attraction', streetMarketTour: 'attraction', cookingClass: 'attraction',
  wineTasting: 'attraction', breweryTour: 'attraction', kidsAttraction: 'attraction',
  point_of_interest: 'attraction', otherActivity: 'attraction',

  // Events → poi.category = 'attraction'
  festival: 'attraction', musicFestival: 'attraction', carnival: 'attraction',
  culturalParade: 'attraction', foodFestival: 'attraction', artExhibition: 'attraction',
  fireworks: 'attraction', sportingEvent: 'attraction', localFestival: 'attraction',
  religiousFestival: 'attraction', streetParade: 'attraction', sportsMatch: 'attraction',
  marathon: 'attraction', concert: 'attraction', theaterShow: 'attraction', foodFair: 'attraction',

  // Services → poi.category = 'service'
  atm: 'service', travelAgency: 'service', laundry: 'service', simCard: 'service',
  hospital: 'service', pharmacy: 'service', currencyExchange: 'service',
  luggageStorage: 'service', touristInfo: 'service', supermarket: 'service',
  tourGuide: 'service', driverService: 'service', bikeRental: 'service',
  scooterRental: 'service', equipmentRental: 'service', locker: 'service',
  showerFacility: 'service', wifiHotspot: 'service', coworkingSpace: 'service',
  embassy: 'service', otherService: 'service',
};

// Types that are geographic locations (not actionable POIs)
const GEO_TYPES = new Set([
  'continent', 'country', 'river', 'delta', 'fjord', 'plateau', 'desert', 'glacier',
  'reef', 'peninsula', 'harbor', 'oldTown', 'state', 'province', 'territory', 'region',
  'archipelago', 'island_group', 'island', 'mountain_range', 'valley', 'bay', 'lake',
  'coastline', 'national_park', 'nature_reserve', 'metropolitan_area', 'municipality',
  'city', 'town', 'village', 'suburb', 'district', 'neighborhood', 'pedestrian_zone',
  'resort_complex', 'itinerary_route', 'border_crossing', 'area',
  'historicDistrict', 'lagoon', 'otherGeography',
]);

// Tips are informational, not entities
const TIP_TYPES = new Set([
  'bestTimeVisit', 'safetyTip', 'packingTip', 'appRecommendation', 'budgetTip',
  'transportTip', 'scamWarning', 'weatherTip', 'healthTip', 'visaTip', 'moneyTip',
  'localEtiquetteTip', 'connectivityTip', 'familyTravelTip', 'otherTip',
]);

interface RecommendationPayload {
  input_type: 'recommendation';
  recommendation_id: string;
  timestamp: string;
  source_url: string;
  source_title?: string;
  source_image?: string;
  analysis: {
    main_site?: string;
    sites_hierarchy: Array<{
      site: string;
      site_type: string;
      sub_sites?: Array<{ site: string; site_type: string; sub_sites?: unknown[] }>;
    }>;
    recommendations?: Array<{
      name: string;
      category: string;
      sentiment: 'good' | 'bad';
      paragraph: string;
      site: string;
      location?: { address?: string; coordinates?: { lat: number; lng: number } };
    }>;
  };
}

interface LinkedEntity {
  entity_type: 'poi' | 'transportation';
  entity_id: string;
  description: string;
  matched_existing: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Resolve user from token ──
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    let userId: string | null = null;

    if (token) {
      const { data: tokenRow } = await supabase
        .from('webhook_tokens').select('user_id').eq('token', token).maybeSingle();
      if (tokenRow) userId = tokenRow.user_id;
      else {
        return new Response(JSON.stringify({ error: 'Invalid webhook token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: RecommendationPayload = await req.json();
    console.log('Received recommendation payload, userId:', userId);

    // Idempotency check
    const { data: existing } = await supabase
      .from('source_recommendations')
      .select('id')
      .eq('recommendation_id', payload.recommendation_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        success: true, action: 'duplicate_skipped', recommendation_id: payload.recommendation_id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Try to match a trip by country (scoped to user if token provided)
    let matchedTripId: string | null = null;
    const countrySites = (payload.analysis.sites_hierarchy || [])
      .filter(s => s.site_type === 'country')
      .map(s => ({ site: s.site, site_type: s.site_type }));

    if (countrySites.length > 0) {
      let query = supabase.from('trips').select('id, countries');
      if (userId) query = query.eq('user_id', userId);
      const { data: trips } = await query;
      if (trips && trips.length > 0) {
        for (const trip of trips) {
          const tripCountries = (trip.countries || []).map((c: string) => c.toLowerCase());
          if (countrySites.some(s => tripCountries.includes(s.site.toLowerCase()))) {
            matchedTripId = trip.id;
            break;
          }
        }
      }
    }

    console.log(`Matched trip: ${matchedTripId || 'none'}`);

    // Insert source_recommendation
    const { data: rec, error: insertError } = await supabase
      .from('source_recommendations')
      .insert([{
        recommendation_id: payload.recommendation_id,
        trip_id: matchedTripId,
        timestamp: payload.timestamp,
        source_url: payload.source_url,
        source_title: payload.source_title || null,
        source_image: payload.source_image || null,
        analysis: payload.analysis,
        status: matchedTripId ? 'linked' : 'pending',
        linked_entities: [],
      }])
      .select('id')
      .single();

    if (insertError) throw insertError;
    const sourceRecId = rec!.id;

    // If matched to a trip, process extracted items with fuzzy entity matching
    const linkedEntities: LinkedEntity[] = [];
    if (matchedTripId) {
      // Pre-fetch existing entities for this trip
      const [{ data: existingPois }, { data: existingTransport }] = await Promise.all([
        supabase.from('points_of_interest').select('id, name, category, source_refs').eq('trip_id', matchedTripId),
        supabase.from('transportation').select('id, category, additional_info, source_refs').eq('trip_id', matchedTripId),
      ]);

      const items = payload.analysis.recommendations || [];

      for (const item of items) {
        const itemType = item.category;

        // Skip geo locations, tips, and bad-sentiment items
        if (GEO_TYPES.has(itemType) || TIP_TYPES.has(itemType) || item.sentiment === 'bad') {
          continue;
        }

        const dbCategory = TYPE_TO_CATEGORY[itemType];
        if (!dbCategory) continue;

        if (dbCategory === 'transportation') {
          // Fuzzy match: check if transportation with similar name exists
          const matchedTransport = existingTransport?.find(t => {
            const info = t.additional_info as Record<string, unknown> | null;
            const existingName = (info?.name as string) || '';
            return existingName && fuzzyMatch(existingName, item.name);
          });

          if (matchedTransport) {
            // Link to existing - add recommendation ref
            const refs = (matchedTransport.source_refs as Record<string, unknown>) || {};
            const recIds = (refs.recommendation_ids as string[]) || [];
            if (!recIds.includes(sourceRecId)) {
              await supabase.from('transportation').update({
                source_refs: { ...refs, recommendation_ids: [...recIds, sourceRecId] },
              }).eq('id', matchedTransport.id);
            }
            linkedEntities.push({
              entity_type: 'transportation', entity_id: matchedTransport.id,
              description: item.name, matched_existing: true,
            });
          } else {
            // Create new transportation
            const { data: newT } = await supabase.from('transportation').insert([{
              trip_id: matchedTripId,
              category: itemType,
              status: 'candidate',
              is_paid: false,
              source_refs: { email_ids: [], recommendation_ids: [sourceRecId] },
              cost: { total_amount: 0, currency: 'USD' },
              booking: {},
              segments: [],
              additional_info: { name: item.name, from_recommendation: true, paragraph: item.paragraph, site: item.site },
            }]).select('id').single();

            if (newT) {
              linkedEntities.push({
                entity_type: 'transportation', entity_id: newT.id,
                description: item.name, matched_existing: false,
              });
            }
          }
        } else {
          // POI: accommodation, eatery, attraction, service
          const poiCategory = dbCategory === 'service' ? 'attraction' : dbCategory;

          // Fuzzy match: check if POI with similar name + same category exists
          const matchedPoi = existingPois?.find(p =>
            p.category === poiCategory && fuzzyMatch(p.name, item.name)
          );

          if (matchedPoi) {
            // Link to existing - add recommendation ref
            const refs = (matchedPoi.source_refs as Record<string, unknown>) || {};
            const recIds = (refs.recommendation_ids as string[]) || [];
            if (!recIds.includes(sourceRecId)) {
              await supabase.from('points_of_interest').update({
                source_refs: { ...refs, recommendation_ids: [...recIds, sourceRecId] },
              }).eq('id', matchedPoi.id);
            }
            linkedEntities.push({
              entity_type: 'poi', entity_id: matchedPoi.id,
              description: item.name, matched_existing: true,
            });
          } else {
            // Create new POI
            const { data: newPoi } = await supabase.from('points_of_interest').insert([{
              trip_id: matchedTripId,
              category: poiCategory,
              sub_category: itemType,
              name: item.name,
              status: 'candidate',
              is_paid: false,
              location: { city: item.site, address: item.location?.address, coordinates: item.location?.coordinates },
              source_refs: { email_ids: [], recommendation_ids: [sourceRecId] },
              details: { from_recommendation: true, paragraph: item.paragraph, source_url: payload.source_url },
            }]).select('id').single();

            if (newPoi) {
              linkedEntities.push({
                entity_type: 'poi', entity_id: newPoi.id,
                description: item.name, matched_existing: false,
              });
            }
          }
        }
      }

      // Update source_recommendation with linked entities
      if (linkedEntities.length > 0) {
        await supabase.from('source_recommendations')
          .update({ linked_entities: linkedEntities })
          .eq('id', sourceRecId);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      source_recommendation_id: sourceRecId,
      matched: !!matchedTripId,
      trip_id: matchedTripId,
      linked_entities: linkedEntities,
      created_entities: linkedEntities.filter(e => !e.matched_existing).length,
      matched_entities: linkedEntities.filter(e => e.matched_existing).length,
      status: matchedTripId ? 'linked' : 'pending',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Recommendation webhook error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error', details: error.message,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Fuzzy match: case-insensitive, checks if one name contains the other
function fuzzyMatch(existingName: string, newName: string): boolean {
  const a = existingName.toLowerCase().trim();
  const b = newName.toLowerCase().trim();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}