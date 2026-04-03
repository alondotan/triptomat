/**
 * POI enrichment orchestrator: geocode + image + DB update.
 * Used by travel-webhook, recommendation-webhook, and enrich-poi edge function.
 */

import { geocodeAddress, fetchPlaceImage } from './geocode.ts';
import { fetchAndSetPoiImage } from './pexels.ts';

// Default sub_category fallback by POI category
const CATEGORY_FALLBACK_SUBCATEGORY: Record<string, string> = {
  attraction: 'other_activity',
  eatery: 'restaurant',
  accommodation: 'hotel',
  service: 'other_service',
  event: 'other_activity',
};

interface EnrichResult {
  coordinates: { lat: number; lng: number } | null;
  imageUrl: string | null;
  subCategory: string | null;
}

/**
 * Enrich a POI with coordinates, image, and subCategory fallback.
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
    .select('location, image_url, sub_category, category')
    .eq('id', poiId)
    .single();

  if (readErr || !poi) {
    console.error('[enrichPoi] Failed to read POI:', readErr);
    return { coordinates: null, imageUrl: null, subCategory: null };
  }

  const existingCoords = poi.location?.coordinates;
  const hasCoords = existingCoords?.lat && existingCoords?.lng;
  const hasImage = !!poi.image_url;
  const hasSubCategory = !!poi.sub_category;

  let coordinates = hasCoords ? existingCoords : null;
  let imageUrl: string | null = hasImage ? poi.image_url : null;
  let subCategory: string | null = hasSubCategory ? poi.sub_category : null;

  // Step 1: Geocode if missing coordinates
  if (!hasCoords) {
    const parts = [name, opts.address, opts.city, opts.country].filter(Boolean);
    const query = parts.join(', ');
    console.log(`[enrichPoi] Geocoding: "${query}"`);

    const geo = await geocodeAddress(query);
    if (geo.coordinates) {
      coordinates = geo.coordinates;

      const updatedLocation = {
        ...poi.location,
        coordinates: geo.coordinates,
      };
      if (geo.formattedAddress && !poi.location?.address) {
        updatedLocation.address = geo.formattedAddress;
      }

      const { error } = await supabase
        .from('points_of_interest')
        .update({ location: updatedLocation })
        .eq('id', poiId);

      if (error) console.error('[enrichPoi] Failed to update coordinates:', error);
      else console.log(`[enrichPoi] Coordinates set for ${poiId}: ${geo.coordinates.lat},${geo.coordinates.lng}`);
    }
  }

  // Step 2: Fetch image if missing
  if (!hasImage) {
    // Try Google Places API first (needs coordinates)
    if (coordinates?.lat && coordinates?.lng) {
      imageUrl = await fetchPlaceImage(name, coordinates.lat, coordinates.lng);
      if (imageUrl) {
        const { error } = await supabase
          .from('points_of_interest')
          .update({ image_url: imageUrl })
          .eq('id', poiId)
          .is('image_url', null);

        if (error) console.error('[enrichPoi] Failed to update image:', error);
        else console.log(`[enrichPoi] Google Places image set for ${poiId}`);
      }
    }

    // Fallback to Pexels
    if (!imageUrl) {
      imageUrl = await fetchAndSetPoiImage(supabase, poiId, name, opts.country);
      if (imageUrl) console.log(`[enrichPoi] Pexels image set for ${poiId}`);
    }
  }

  // Step 3: Set subCategory fallback if missing
  if (!hasSubCategory) {
    const category = opts.category || poi.category;
    const fallback = CATEGORY_FALLBACK_SUBCATEGORY[category] ?? null;
    if (fallback) {
      const { error } = await supabase
        .from('points_of_interest')
        .update({ sub_category: fallback })
        .eq('id', poiId)
        .is('sub_category', null);

      if (error) console.error('[enrichPoi] Failed to update subCategory:', error);
      else {
        subCategory = fallback;
        console.log(`[enrichPoi] subCategory fallback set for ${poiId}: ${fallback}`);
      }
    }
  }

  return { coordinates, imageUrl, subCategory };
}
