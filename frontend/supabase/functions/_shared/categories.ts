/** Maps extracted item type → DB entity category. */
export const TYPE_TO_CATEGORY: Record<string, string> = {
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

  // Activities / Events → poi.category = 'attraction'
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

  // Services → poi.category = 'service'
  atm: 'service', travelAgency: 'service', laundry: 'service', simCard: 'service',
  hospital: 'service', pharmacy: 'service', currencyExchange: 'service',
  luggageStorage: 'service', touristInfo: 'service', supermarket: 'service',
  tourGuide: 'service', driverService: 'service', bikeRental: 'service',
  scooterRental: 'service', equipmentRental: 'service', locker: 'service',
  showerFacility: 'service', wifiHotspot: 'service', coworkingSpace: 'service',
  embassy: 'service', otherService: 'service',

  // Contacts → contact entity
  tourGuideContact: 'contact', hostContact: 'contact', driverContact: 'contact',
  agencyContact: 'contact', rentalContact: 'contact', restaurantContact: 'contact',
  otherContact: 'contact',
};

/** All non-geo types as a comma-separated string (for AI prompts). */
export const ALLOWED_TYPES_CSV = Object.keys(TYPE_TO_CATEGORY).join(', ');

/** Geographic location types (not actionable POIs). */
export const GEO_TYPES = new Set([
  'continent', 'country', 'state', 'province', 'territory', 'region',
  'archipelago', 'island_group', 'island', 'mountain_range', 'valley',
  'canyon', 'volcano', 'waterfall', 'lagoon', 'bay', 'lake', 'coastline',
  'national_park', 'nature_reserve', 'metropolitan_area', 'municipality',
  'city', 'town', 'village', 'suburb', 'district', 'neighborhood',
  'pedestrian_zone', 'transit_hub', 'resort_complex', 'itinerary_route',
  'border_crossing', 'area', 'historicDistrict', 'oldTown',
  'river', 'delta', 'fjord', 'plateau', 'desert', 'glacier', 'reef',
  'peninsula', 'harbor', 'monastery', 'county', 'republic', 'oblast',
  'borough', 'capital_city', 'department', 'reserve', 'township',
  'forest', 'governorate', 'metropolis', 'prefecture', 'atoll',
  'otherGeography',
]);

/** Geo types as a comma-separated string (for AI prompts). */
export const GEO_TYPES_CSV = [...GEO_TYPES].join(', ');

/** Tip types — informational, not entities. */
export const TIP_TYPES = new Set([
  'bestTimeVisit', 'safetyTip', 'packingTip', 'appRecommendation', 'budgetTip',
  'transportTip', 'scamWarning', 'weatherTip', 'healthTip', 'visaTip', 'moneyTip',
  'localEtiquetteTip', 'connectivityTip', 'familyTravelTip', 'otherTip',
]);

export function getCategoryForType(type: string): string | undefined {
  return TYPE_TO_CATEGORY[type];
}

export function isGeographicType(type: string): boolean {
  return GEO_TYPES.has(type);
}
