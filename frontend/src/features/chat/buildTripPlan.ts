import type { PointOfInterest } from '@/types/trip';

interface PlanDay {
  tripPlaceId?: string | null;
  date?: string | null;
  dayNumber: number;
  accommodationOptions?: Array<{ is_selected: boolean; poi_id: string }> | null;
  activities?: Array<{ type: string; id: string; order: number; time_window?: { start?: string } | null }> | null;
}

interface TripPlaceRef { id: string; tripLocationId: string }
interface TripLocationRef { id: string; name: string }

export function buildTripPlan(
  pois: PointOfInterest[],
  itineraryDays: PlanDay[],
  tripPlaces: TripPlaceRef[],
  tripLocations: TripLocationRef[],
) {
  const poiMap = new Map(pois.map(p => [p.id, p]));

  const scheduledPoiIds = new Set(
    itineraryDays.flatMap(d =>
      (d.activities ?? []).filter(a => a.type === 'poi').map(a => a.id)
    )
  );

  const placeLocMap = new Map(
    tripPlaces.map(tp => {
      const loc = tripLocations.find(l => l.id === tp.tripLocationId);
      return [tp.id, loc?.name ?? ''];
    })
  );

  const locationDaysMap = new Map<string, PlanDay[]>();
  for (const day of itineraryDays) {
    const loc = (day.tripPlaceId && placeLocMap.get(day.tripPlaceId)) || '';
    if (!locationDaysMap.has(loc)) locationDaysMap.set(loc, []);
    locationDaysMap.get(loc)!.push(day);
  }

  const tripLocationByName = new Map(tripLocations.map(tl => [tl.name.toLowerCase(), tl]));

  type PotentialPOI = { id: string; name: string; category: string; status: string };
  const potentialByCity = new Map<string, PotentialPOI[]>();
  const unassigned: PotentialPOI[] = [];
  for (const poi of pois) {
    if (scheduledPoiIds.has(poi.id)) continue;
    const city = poi.location?.city || '';
    if (!city) {
      unassigned.push({ id: poi.id, name: poi.name, category: poi.category, status: poi.status });
      continue;
    }
    if (!potentialByCity.has(city)) potentialByCity.set(city, []);
    potentialByCity.get(city)!.push({ id: poi.id, name: poi.name, category: poi.category, status: poi.status });
  }

  const hotels = pois
    .filter(p => p.category === 'accommodation')
    .map(p => ({ id: p.id, name: p.name, city: p.location?.city }));

  const locations = [...locationDaysMap.entries()].map(([locName, days]) => ({
    id: tripLocationByName.get(locName.toLowerCase())?.id,
    name: locName,
    days: days.map(day => {
      const selectedHotel = (day.accommodationOptions ?? []).find(a => a.is_selected);
      const hotelPoi = selectedHotel ? poiMap.get(selectedHotel.poi_id) : undefined;
      return {
        dayNumber: day.dayNumber,
        date: day.date,
        hotel_id: hotelPoi?.id,
        places: (day.activities ?? [])
          .filter(a => a.type === 'poi' && poiMap.has(a.id))
          .sort((a, b) => a.order - b.order)
          .map(a => {
            const poi = poiMap.get(a.id)!;
            return { id: poi.id, name: poi.name, category: poi.category, time: a.time_window?.start ?? undefined };
          }),
      };
    }),
    potential: potentialByCity.get(locName) ?? [],
  }));

  for (const [city, potentials] of potentialByCity.entries()) {
    if (!locationDaysMap.has(city)) {
      locations.push({ id: tripLocationByName.get(city.toLowerCase())?.id, name: city, days: [], potential: potentials });
    }
  }

  return {
    locations,
    unassigned: unassigned.length ? unassigned : undefined,
    hotels: hotels.length ? hotels : undefined,
  };
}
