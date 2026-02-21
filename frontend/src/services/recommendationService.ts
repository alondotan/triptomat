import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { SourceRecommendation } from '@/types/webhook';

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
  const extractedItems = analysis?.extracted_items || [];
  const linkedEntities: Array<{ entity_type: string; entity_id: string; description: string; matched_existing: boolean }> = [];

  // Pre-fetch existing entities for this trip
  const [{ data: existingPois }, { data: existingTransport }] = await Promise.all([
    supabase.from('points_of_interest').select('id, name, category, source_refs').eq('trip_id', tripId),
    supabase.from('transportation').select('id, category, additional_info, source_refs').eq('trip_id', tripId),
  ]);

  // Category mapping (simplified version matching the webhook)
  const TYPE_TO_CATEGORY: Record<string, string> = {
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
    car: 'transportation', bus: 'transportation', train: 'transportation', subway: 'transportation',
    bicycle: 'transportation', motorcycle: 'transportation', taxi: 'transportation',
    ferry: 'transportation', airplane: 'transportation', scooter: 'transportation',
    cruise: 'transportation', tram: 'transportation', cruiseShip: 'transportation',
    carRental: 'transportation', domesticFlight: 'transportation', internationalFlight: 'transportation',
    nightTrain: 'transportation', highSpeedTrain: 'transportation', cableCar: 'transportation',
    funicular: 'transportation', boatTaxi: 'transportation', rideshare: 'transportation',
    privateTransfer: 'transportation', otherTransportation: 'transportation',
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
    festival: 'attraction', musicFestival: 'attraction', carnival: 'attraction',
    culturalParade: 'attraction', foodFestival: 'attraction', artExhibition: 'attraction',
    fireworks: 'attraction', sportingEvent: 'attraction', localFestival: 'attraction',
    religiousFestival: 'attraction', streetParade: 'attraction', sportsMatch: 'attraction',
    marathon: 'attraction', concert: 'attraction', theaterShow: 'attraction', foodFair: 'attraction',
    atm: 'service', travelAgency: 'service', laundry: 'service', simCard: 'service',
    hospital: 'service', pharmacy: 'service', currencyExchange: 'service',
    luggageStorage: 'service', touristInfo: 'service', supermarket: 'service',
    tourGuide: 'service', driverService: 'service', bikeRental: 'service',
    scooterRental: 'service', equipmentRental: 'service', locker: 'service',
    showerFacility: 'service', wifiHotspot: 'service', coworkingSpace: 'service',
    embassy: 'service', otherService: 'service',
  };

  const GEO_TYPES = new Set([
    'continent', 'country', 'river', 'delta', 'fjord', 'plateau', 'desert', 'glacier',
    'reef', 'peninsula', 'harbor', 'oldTown', 'state', 'province', 'territory', 'region',
    'archipelago', 'island_group', 'island', 'mountain_range', 'valley', 'bay', 'lake',
    'coastline', 'national_park', 'nature_reserve', 'metropolitan_area', 'municipality',
    'city', 'town', 'village', 'suburb', 'district', 'neighborhood', 'pedestrian_zone',
    'resort_complex', 'itinerary_route', 'border_crossing', 'area',
    'historicDistrict', 'lagoon', 'otherGeography',
  ]);

  const TIP_TYPES = new Set([
    'bestTimeVisit', 'safetyTip', 'packingTip', 'appRecommendation', 'budgetTip',
    'transportTip', 'scamWarning', 'weatherTip', 'healthTip', 'visaTip', 'moneyTip',
    'localEtiquetteTip', 'connectivityTip', 'familyTravelTip', 'otherTip',
  ]);

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
          trip_id: tripId, category: itemType, status: 'candidate',
          source_refs: { email_ids: [], recommendation_ids: [recommendationId] } as unknown as Json,
          cost: { total_amount: 0, currency: 'USD' } as unknown as Json,
          booking: {} as unknown as Json,
          segments: [] as unknown as Json,
          additional_info: { name: item.name, from_recommendation: true, paragraph: item.paragraph, site: item.site } as unknown as Json,
        }]).select('id').single();
        if (newT) linkedEntities.push({ entity_type: 'transportation', entity_id: newT.id, description: item.name, matched_existing: false });
      }
    } else {
      const poiCategory = dbCategory === 'service' ? 'attraction' : dbCategory;
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
          status: 'candidate',
          location: { city: item.site } as unknown as Json,
          source_refs: { email_ids: [], recommendation_ids: [recommendationId] } as unknown as Json,
          details: { from_recommendation: true, paragraph: item.paragraph, source_url: rec.source_url } as unknown as Json,
        }]).select('id').single();
        if (newPoi) linkedEntities.push({ entity_type: 'poi', entity_id: newPoi.id, description: item.name, matched_existing: false });
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
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}