// Trip Planner Data Types - New Schema

export type Currency = string;
export type TripStatus = 'research' | 'planning' | 'detailed_planning' | 'active' | 'completed';
export type POICategory = 'accommodation' | 'eatery' | 'attraction' | 'service' | 'event';
export type EntityStatus = 'suggested' | 'interested' | 'planned' | 'scheduled' | 'booked' | 'visited' | 'skipped';
export type POIStatus = EntityStatus;
export type TransportStatus = EntityStatus;
export type MissionStatus = 'pending' | 'completed' | 'cancelled';

// ============================================================
// TRIP
// ============================================================
export interface Trip {
  id: string;
  name: string;
  description?: string;
  countries: string[];
  startDate?: string;
  endDate?: string;
  numberOfDays?: number;
  status: TripStatus;
  currency: Currency;
  myRole?: 'owner' | 'editor';
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// POINT OF INTEREST (POI)
// ============================================================
export interface POILocation {
  country?: string;
  city?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
}

export interface SourceRefs {
  email_ids: string[];
  recommendation_ids: string[];
  map_list_ids?: string[];
}

export interface POICost {
  amount: number;
  currency: string;
}

export interface POIBooking {
  reservation_date?: string;
  reservation_hour?: string;
  number_of_people?: number;
  trip_day_number?: number;
}

export interface AccommodationDetails {
  rooms?: Array<{ room_type?: string; occupancy?: string }>;
  checkin?: { date?: string; hour?: string };
  checkout?: { date?: string; hour?: string };
  checkin_day_number?: number;
  checkout_day_number?: number;
  price_per_night?: number;
  free_cancellation_until?: string | null;
}

export interface ActivityDetails {
  duration?: number; // minutes
  opening_hours?: string;
}

export interface EventDetails {
  date?: string;                          // resolved date for the trip year (ISO)
  fixed_date?: boolean;                   // true = same date every year (e.g. Christmas 12-25)
  dates_by_year?: Record<string, string>; // year → ISO date for variable holidays
  typical_months?: number[];              // for festivals without exact dates
  local_name?: string;
  description?: string;
  location_ids?: string[];                // IDs from country data location tree (e.g. "ireland", "dublin")
}

export interface POIDetails {
  cost?: POICost;
  order_number?: string;
  free_cancellation_until?: string | null;
  bookings?: POIBooking[];
  accommodation_details?: AccommodationDetails;
  activity_details?: ActivityDetails;
  event_details?: EventDetails;
  notes?: { user_summary?: string; raw_notes?: string };
}

export interface PointOfInterest {
  id: string;
  tripId: string;
  category: POICategory;
  subCategory?: string;
  name: string;
  status: POIStatus;
  location: POILocation;
  sourceRefs: SourceRefs;
  details: POIDetails;
  isCancelled: boolean;
  isPaid: boolean;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// TRANSPORTATION
// ============================================================
export interface TransportCost {
  total_amount: number;
  currency: string;
}

export interface TransportBooking {
  order_number?: string;
  carrier_name?: string;
  baggage_allowance?: { cabin_bag?: string; checked_bag?: string };
  free_cancellation_until?: string | null;
}

export interface TransportSegment {
  segment_id?: string;
  from: {
    name: string;
    code?: string;
    address?: { street?: string; city?: string; country?: string };
    coordinates?: { lat: number; lng: number };
  };
  to: {
    name: string;
    code?: string;
    address?: { street?: string; city?: string; country?: string };
    coordinates?: { lat: number; lng: number };
  };
  departure_time: string; // ISO8601
  arrival_time: string;
  departure_day_number?: number;
  arrival_day_number?: number;
  carrier_code?: string;
  flight_or_vessel_number?: string;
  seat_info?: string;
}

export interface Transportation {
  id: string;
  tripId: string;
  category: string; // airplane, domesticFlight, internationalFlight, train, nightTrain, highSpeedTrain, bus, subway, tram, ferry, cruise, cruiseShip, taxi, carRental, rideshare, privateTransfer, car, bicycle, motorcycle, scooter, boatTaxi, cableCar, funicular, rv, otherTransportation
  status: TransportStatus;
  sourceRefs: SourceRefs;
  cost: TransportCost;
  booking: TransportBooking;
  segments: TransportSegment[];
  additionalInfo: { notes?: string; layover_details?: string };
  isCancelled: boolean;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// COLLECTION
// ============================================================
export interface CollectionItem {
  cronical_order: number;
  entity_type: 'poi' | 'transportation';
  entity_id: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
}

export interface Collection {
  id: string;
  tripId: string;
  collectionName: string;
  status: EntityStatus;
  timeWindow: { start_time?: string; end_time?: string };
  items: CollectionItem[];
  sourceRefs: { recommendation_ids: string[] };
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// MISSION
// ============================================================
export interface Mission {
  id: string;
  tripId: string;
  title: string;
  description?: string;
  status: MissionStatus;
  dueDate?: string;
  contextLinks: string[];
  reminders: Array<{ reminder_id: string; remind_at: string; is_sent: boolean }>;
  objectLink?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// TRIP PLACE
// ============================================================
export interface TripPlace {
  id: string;
  tripId: string;
  tripLocationId: string;  // always set — points to geo hierarchy node
  potentialActivityIds: string[];  // POI IDs shared across all days at this place
  notes: string;
  imageUrl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// ITINERARY DAY
// ============================================================
export interface ItineraryAccommodationOption {
  is_selected: boolean;
  poi_id: string;
  notes?: string;
}

export interface ItineraryActivity {
  order: number;
  type: 'poi' | 'collection' | 'time_block';
  id: string;
  schedule_state?: 'potential' | 'scheduled';
  time_window?: { start?: string; end?: string };
  label?: string; // custom label for time_block activities
}

export interface ItineraryTransportSegment {
  is_selected: boolean;
  transportation_id: string;
  segment_id?: string;
  notes?: string;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date?: string;
  tripPlaceId?: string;  // FK → trip_places (nullable = unassigned day)
  accommodationOptions: ItineraryAccommodationOption[];
  activities: ItineraryActivity[];
  transportationSegments: ItineraryTransportSegment[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// EXPENSE (manual)
// ============================================================
export interface Expense {
  id: string;
  tripId: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  date?: string;
  notes?: string;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CONTACT
// ============================================================
export type ContactRole = 'guide' | 'host' | 'rental' | 'restaurant' | 'driver' | 'agency' | 'emergency' | 'other';

export interface Contact {
  id: string;
  tripId: string;
  name: string;
  role: ContactRole;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// DOCUMENT
// ============================================================
export type DocumentCategory = 'passport' | 'visa' | 'insurance' | 'id' | 'flight' | 'hotel' | 'car_rental' | 'activity' | 'other';

export interface TripDocument {
  id: string;
  userId: string;
  tripId: string | null;
  category: DocumentCategory;
  name: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  storagePath: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// COMPUTED TYPES
// ============================================================
export interface CostBreakdown {
  transport: number;
  lodging: number;
  activities: number;
  services: number;
  total: number;
}

// Map data types
export interface MapMarker {
  id: string;
  position: [number, number];
  label: string;
  type: 'accommodation' | 'activity' | 'transport' | 'eatery' | 'service' | 'event';
}
