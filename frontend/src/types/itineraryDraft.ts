export interface DraftPlace {
  // Identification — at least one required
  existingPoiId?: string;     // place_id: existing POI — use as-is
  locationId?: string;        // location_id: existing trip_location to place new POI under
  locationName?: string;      // location_name: new/override location name
  locationParentId?: string;  // location_parent_id: parent location when creating a new location by name
  eventId?: string;           // event_id: festival/event this activity relates to

  // Place data — required when existingPoiId is absent
  name: string;             // place_name from AI (name of the place, not an activity description)
  category: string;
  placeType?: string;       // sub-type (e.g. "boutique_hotel", "restaurant")
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
  /** @deprecated use locationId/locationName */
  locationContext?: string;
  locationId?: string;        // location_id: existing trip_location for this day
  locationName?: string;      // location_name: new/override location name for this day
  locationParentId?: string;  // location_parent_id: parent location when creating a new location by name
  places: DraftPlace[];
  /** ID of accommodation POI where traveler sleeps this night */
  hotelId?: string;
  /** Hotel name when no hotelId is available */
  hotelName?: string;
  /** Sub-type of the hotel (e.g. "boutique_hotel") when creating a new one */
  hotelPlaceType?: string;
}
