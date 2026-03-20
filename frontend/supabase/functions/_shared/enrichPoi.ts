/**
 * POI enrichment orchestrator: geocode + image + DB update.
 * Used by travel-webhook, recommendation-webhook, and enrich-poi edge function.
 */

import { geocodeAddress, fetchPlaceImage } from './geocode.ts';
import { fetchAndSetPoiImage } from './pexels.ts';

interface EnrichResult {
  coordinates: { lat: number; lng: number } | null;
  imageUrl: string | null;
}

/**
 * Enrich a POI with coordinates and image.
 * Only updates fields that are currently missing (null).
 *
 * @param supabase - Supabase client (service role)
 * @param poiId - POI UUID
 * @param name - POI name (for geocoding and image search)
 * @param opts - optional location hints
 */
export async function enrichPoi(
  supabase: { from: (table: string) => any },
  poiId: string,
  name: string,
  opts: { city?: string; country?: string; address?: string } = {},
): Promise<EnrichResult> {
  // Read current POI state to know what's missing
  const { data: poi, error: readErr } = await supabase
    .from('points_of_interest')
    .select('location, image_url')
    .eq('id', poiId)
    .single();

  if (readErr || !poi) {
    console.error('[enrichPoi] Failed to read POI:', readErr);
    return { coordinates: null, imageUrl: null };
  }

  const existingCoords = poi.location?.coordinates;
  const hasCoords = existingCoords?.lat && existingCoords?.lng;
  const hasImage = !!poi.image_url;

  if (hasCoords && hasImage) {
    return { coordinates: existingCoords, imageUrl: poi.image_url };
  }

  let coordinates = hasCoords ? existingCoords : null;
  let imageUrl: string | null = hasImage ? poi.image_url : null;

  // Step 1: Geocode if missing coordinates
  if (!hasCoords) {
    const parts = [name, opts.address, opts.city, opts.country].filter(Boolean);
    const query = parts.join(', ');
    console.log(`[enrichPoi] Geocoding: "${query}"`);

    const geo = await geocodeAddress(query);
    if (geo.coordinates) {
      coordinates = geo.coordinates;

      // Update location in DB (merge with existing location object)
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

  return { coordinates, imageUrl };
}
