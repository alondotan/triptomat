/**
 * Google Geocoding API + Places API (New) for POI enrichment.
 * Falls back to Nominatim (free, no key) when Google API key is unavailable.
 */

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') || '';

export interface GeoResult {
  coordinates: { lat: number; lng: number } | null;
  formattedAddress: string | null;
}

async function geocodeWithGoogle(query: string): Promise<GeoResult> {
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
    console.error('[geocode] Google API error:', e);
  }
  return { coordinates: null, formattedAddress: null };
}

async function geocodeWithNominatim(query: string): Promise<GeoResult> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Triptomat/1.0' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { coordinates: null, formattedAddress: null };

    const data = await res.json();
    if (!data?.length) return { coordinates: null, formattedAddress: null };

    const r = data[0];
    if (r.lat && r.lon) {
      return {
        coordinates: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
        formattedAddress: r.display_name || null,
      };
    }
  } catch (e) {
    console.error('[geocode] Nominatim error:', e);
  }
  return { coordinates: null, formattedAddress: null };
}

/**
 * Geocode a text query to coordinates + formatted address.
 * Tries Google Maps first (if API key available), then falls back to Nominatim.
 */
export async function geocodeAddress(query: string): Promise<GeoResult> {
  if (GOOGLE_MAPS_API_KEY) {
    const result = await geocodeWithGoogle(query);
    if (result.coordinates) return result;
    console.warn('[geocode] Google returned no results, trying Nominatim');
  } else {
    console.warn('[geocode] GOOGLE_MAPS_API_KEY not configured, using Nominatim');
  }
  return geocodeWithNominatim(query);
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
      const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=800&key=${GOOGLE_MAPS_API_KEY}`;
      const imgRes = await fetch(mediaUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (imgRes.ok) return imgRes.url;
    }
  } catch (e) {
    console.error('[geocode] Places API error:', e);
  }

  return null;
}

export interface PlaceSearchResult {
  coordinates: { lat: number; lng: number } | null;
  imageUrl: string | null;
}

/**
 * Google Places text search (no location bias).
 * Finds places that aren't in the Geocoding API (e.g. small beaches, surf spots)
 * and returns both coordinates and a photo in a single call.
 */
export async function searchPlaceTextSearch(
  name: string,
  country?: string,
): Promise<PlaceSearchResult> {
  if (!GOOGLE_MAPS_API_KEY) return { coordinates: null, imageUrl: null };

  const textQuery = country ? `${name} ${country}` : name;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.location,places.photos',
      },
      body: JSON.stringify({ textQuery }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return { coordinates: null, imageUrl: null };
    const data = await res.json();

    const place = data.places?.[0];
    if (!place) return { coordinates: null, imageUrl: null };

    const loc = place.location;
    const coordinates =
      loc?.latitude != null && loc?.longitude != null
        ? { lat: loc.latitude as number, lng: loc.longitude as number }
        : null;

    let imageUrl: string | null = null;
    const photoName = place.photos?.[0]?.name;
    if (photoName) {
      const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=800&key=${GOOGLE_MAPS_API_KEY}`;
      const imgRes = await fetch(mediaUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (imgRes.ok) imageUrl = imgRes.url;
    }

    return { coordinates, imageUrl };
  } catch (e) {
    console.error('[geocode] Places text search error:', e);
    return { coordinates: null, imageUrl: null };
  }
}
