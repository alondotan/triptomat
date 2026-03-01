// Trip Planner Data Types - New Schema

export type Currency = string;
export type TripStatus = 'research' | 'planning' | 'active' | 'completed';
export type POICategory = 'accommodation' | 'eatery' | 'attraction' | 'service';
export type POIStatus = 'candidate' | 'in_plan' | 'matched' | 'booked' | 'visited';
export type TransportStatus = 'candidate' | 'in_plan' | 'booked' | 'completed';
export type MissionStatus = 'pending' | 'completed' | 'cancelled';

// ============================================================
// TRIP
// ============================================================
export interface Trip {
  id: string;
  name: string;
  description?: string;
  countries: string[];
  startDate: string;
  endDate: string;
  status: TripStatus;
  currency: Currency;
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
}

export interface POICost {
  amount: number;
  currency: string;
}

export interface POIBooking {
  reservation_date?: string;
  reservation_hour?: string;
  number_of_people?: number;
  schedule_state?: 'potential' | 'scheduled';
}

export interface AccommodationDetails {
  rooms?: Array<{ room_type?: string; occupancy?: string }>;
  checkin?: { date?: string; hour?: string };
  checkout?: { date?: string; hour?: string };
  price_per_night?: number;
}

export interface ActivityDetails {
  duration?: number; // minutes
  opening_hours?: string;
}

export interface POIDetails {
  cost?: POICost;
  order_number?: string;
  bookings?: POIBooking[];
  accommodation_details?: AccommodationDetails;
  activity_details?: ActivityDetails;
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
  carrier_code?: string;
  flight_or_vessel_number?: string;
  seat_info?: string;
}

export interface Transportation {
  id: string;
  tripId: string;
  category: string; // flight, train, ferry, bus, taxi, car_rental, etc.
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
  status: 'candidate' | 'in_plan' | 'booked';
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
  locationContext?: string;
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
  type: 'accommodation' | 'activity' | 'transport' | 'eatery' | 'service';
}
