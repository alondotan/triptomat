/**
 * POI enrichment orchestrator: geocode + image + DB update.
 * Used by travel-webhook, recommendation-webhook, and enrich-poi edge function.
 */

import { geocodeAddress, fetchPlaceImage } from './geocode.ts';
import { fetchAndSetPoiImage } from './pexels.ts';
import { fetchWikipediaImage } from './wikipedia.ts';

// Default place_type fallback by POI category (is_physical_place=true values)
const CATEGORY_FALLBACK_PLACE_TYPE: Record<string, string> = {
  attraction: 'landmark',
  eatery: 'restaurant',
  accommodation: 'hotel',
  service: 'point_of_interest',
  event: 'point_of_interest',
};

// Default activity_type fallback by POI category (is_activity=true values)
const CATEGORY_FALLBACK_ACTIVITY_TYPE: Record<string, string> = {
  attraction: 'sightseeing',
  eatery: 'dining',
  event: 'other_activity',
};

interface EnrichResult {
  coordinates: { lat: number; lng: number } | null;
  imageUrl: string | null;
  placeType: string | null;
  activityType: string | null;
}

/**
 * Enrich a POI with coordinates, image, and type fallbacks.
 * Only updates fields that are currently missing (null/undefined).
 *
 * @param supabase - Supabase client (service role)
 * @param poiId - POI UUID
 * @param name - POI name (for geocoding and image search)
 * @param opts - optional location hints and category
 */
export async function enrichPoi(
  supabase: { from: (table: string) => any },
  poiId: string,
  name: string,
  opts: { city?: string; country?: string; address?: string; category?: string } = {},
): Promise<EnrichResult> {
  // Read current POI state to know what's missing
  const { data: poi, error: readErr } = await supabase
    .from('points_of_interest')
    .select('location, image_url, place_type, activity_type, category')
    .eq('id', poiId)
    .single();

  if (readErr || !poi) {
    console.error('[enrichPoi] Failed to read POI:', readErr);
    return { coordinates: null, imageUrl: null, placeType: null, activityType: null };
  }

  const existingCoords = poi.location?.coordinates;
  const hasCoords = existingCoords?.lat && existingCoords?.lng;
  const hasImage = !!poi.image_url;
  const hasPlaceType = !!poi.place_type;
  const hasActivityType = !!poi.activity_type;

  let coordinates = hasCoords ? existingCoords : null;
  let imageUrl: string | null = hasImage ? poi.image_url : null;
  let placeType: string | null = hasPlaceType ? poi.place_type : null;
  let activityType: string | null = hasActivityType ? poi.activity_type : null;

  // Step 1: Geocode if missing coordinates or address
  const hasAddress = !!poi.location?.address;
  if (!hasCoords || !hasAddress) {
    const parts = [name, opts.address, opts.city, opts.country].filter(Boolean);
    const query = parts.join(', ');
    console.log(`[enrichPoi] Geocoding: "${query}"`);

    const geo = await geocodeAddress(query);
    if (geo.coordinates || geo.formattedAddress) {
      if (geo.coordinates) coordinates = geo.coordinates;

      const updatedLocation = {
        ...poi.location,
        ...(geo.coordinates && !hasCoords ? { coordinates: geo.coordinates } : {}),
        ...(geo.formattedAddress && !hasAddress ? { address: geo.formattedAddress } : {}),
      };

      const { error } = await supabase
        .from('points_of_interest')
        .update({ location: updatedLocation })
        .eq('id', poiId);

      if (error) console.error('[enrichPoi] Failed to update location:', error);
      else console.log(`[enrichPoi] Location updated for ${poiId}:`, { coords: !!geo.coordinates, address: !!geo.formattedAddress });
    }
  }

  // Step 2: Fetch image if missing
  if (!hasImage) {
    // Try Wikipedia first
    imageUrl = await fetchWikipediaImage(name);
    if (imageUrl) {
      const { error } = await supabase
        .from('points_of_interest')
        .update({ image_url: imageUrl })
        .eq('id', poiId)
        .is('image_url', null);
      if (error) console.error('[enrichPoi] Failed to update Wikipedia image:', error);
      else console.log(`[enrichPoi] Wikipedia image set for ${poiId}`);
    }

    // Try Google Places API (needs coordinates)
    if (!imageUrl && coordinates?.lat && coordinates?.lng) {
      imageUrl = await fetchPlaceImage(name, coordinates.lat, coordinates.lng);
      if (imageUrl) {
        const { error } = await supabase
          .from('points_of_interest')
          .update({ image_url: imageUrl })
          .eq('id', poiId)
          .is('image_url', null);

        if (error) console.error('[enrichPoi] Failed to update Google image:', error);
        else console.log(`[enrichPoi] Google Places image set for ${poiId}`);
      }
    }

    // Fallback to Pexels
    if (!imageUrl) {
      imageUrl = await fetchAndSetPoiImage(supabase, poiId, name, opts.country);
      if (imageUrl) console.log(`[enrichPoi] Pexels image set for ${poiId}`);
    }
  }

  // Step 3: Set place_type / activity_type fallbacks if missing
  const category = opts.category || poi.category;
  const typeUpdates: Record<string, string> = {};

  if (!hasPlaceType) {
    const fallback = CATEGORY_FALLBACK_PLACE_TYPE[category] ?? null;
    if (fallback) {
      typeUpdates.place_type = fallback;
      placeType = fallback;
    }
  }
  if (!hasActivityType) {
    const fallback = CATEGORY_FALLBACK_ACTIVITY_TYPE[category] ?? null;
    if (fallback) {
      typeUpdates.activity_type = fallback;
      activityType = fallback;
    }
  }

  if (Object.keys(typeUpdates).length > 0) {
    const { error } = await supabase
      .from('points_of_interest')
      .update(typeUpdates)
      .eq('id', poiId);

    if (error) console.error('[enrichPoi] Failed to update type fields:', error);
    else console.log(`[enrichPoi] Type fallbacks set for ${poiId}:`, typeUpdates);
  }

  return { coordinates, imageUrl, placeType, activityType };
}
