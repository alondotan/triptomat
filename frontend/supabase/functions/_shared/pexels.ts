const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY') || '';

/**
 * Search Pexels for a landscape image matching the given attraction name + country.
 * If found, updates the POI's image_url in the database (only if still null).
 * Returns the image URL or null.
 */
export async function fetchAndSetPoiImage(
  supabase: { from: (table: string) => any },
  poiId: string,
  name: string,
  country?: string,
): Promise<string | null> {
  if (!PEXELS_API_KEY) {
    console.warn('[pexels] PEXELS_API_KEY not configured');
    return null;
  }

  const query = country ? `${name} ${country}` : name;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;

  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!res.ok) {
    console.error(`[pexels] API error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const imageUrl: string | null = data.photos?.[0]?.src?.landscape || null;

  if (!imageUrl) return null;

  const { error } = await supabase
    .from('points_of_interest')
    .update({ image_url: imageUrl })
    .eq('id', poiId)
    .is('image_url', null);

  if (error) {
    console.error('[pexels] DB update error:', error);
  }

  return imageUrl;
}
