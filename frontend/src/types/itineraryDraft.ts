export interface DraftPlace {
  name: string;
  category: 'accommodation' | 'eatery' | 'attraction' | 'service' | 'event';
  city?: string;
  notes?: string;
  time?: string;        // "HH:mm"
  duration?: number;    // minutes
  existingPoiId?: string; // set when loaded from real itinerary
}

export interface DraftDay {
  dayNumber: number;
  date?: string;
  locationContext?: string;
  places: DraftPlace[];
}
