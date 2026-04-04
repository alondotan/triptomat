export interface DraftPlace {
  // Identification — at least one required
  existingPoiId?: string;   // place_id: existing POI — use as-is
  locationId?: string;      // location_id: existing trip_location to place new POI under
  locationName?: string;    // location_name: new/override location name
  eventId?: string;         // event_id: festival/event this activity relates to

  // Place data — required when existingPoiId is absent
  name: string;             // place_name from AI (name of the place, not an activity description)
  category: string;
  description?: string;     // what the user will do there
  isSpecificPlace?: boolean;
  city?: string;
  notes?: string;

  // Scheduling
  startTime?: string;       // HH:mm — exact time → schedule_state: scheduled
  dayPart?: string;         // Morning/Afternoon/Evening/Night → schedule_state: potential
  duration?: string;        // e.g. "2h" or "45m"

  /** @deprecated use startTime */
  time?: string;
}

export interface DraftDay {
  dayNumber: number;
  date?: string;
  locationContext?: string;
  places: DraftPlace[];
}
