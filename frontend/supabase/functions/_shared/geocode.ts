/**
 * Google Geocoding API + Places API (New) for POI enrichment.
 * Ported from core/scrapers.py MapsService.
 */

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') || '';

export interface GeoResult {
  coordinates: { lat: number; lng: number } | null;
  formattedAddress: string | null;
}

/**
 * Geocode a text query to coordinates + formatted address.
 */
export async function geocodeAddress(query: string): Promise<GeoResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('[geocode] GOOGLE_MAPS_API_KEY not configured');
    return { coordinates: null, formattedAddress: null };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { coordinates: null, formattedAddress: null };

    const data = await res.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const result = data.results[0];
      const loc = result.geometry?.location;
      if (loc?.lat && loc?.lng) {
        return {
          coordinates: { lat: loc.lat, lng: loc.lng },
          formattedAddress: result.formatted_address || null,
        };
      }
    }
  } catch (e) {
    console.error('[geocode] Geocoding API error:', e);
  }

  return { coordinates: null, formattedAddress: null };
}

/**
 * Fetch a place photo via Google Places API (New) textSearch with location bias.
 */
export async function fetchPlaceImage(
  name: string,
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.photos,places.id',
      },
      body: JSON.stringify({
        textQuery: name,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 500.0,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    const photoName = data.places?.[0]?.photos?.[0]?.name;
    if (photoName) {
      // Follow the redirect server-side so we store the final public CDN URL
      // (not the key-bearing Places API URL, which fails from the browser)
      const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=800&key=${GOOGLE_MAPS_API_KEY}`;
      const imgRes = await fetch(mediaUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (imgRes.ok) return imgRes.url;
    }
  } catch (e) {
    console.error('[geocode] Places API error:', e);
  }

  return null;
}
