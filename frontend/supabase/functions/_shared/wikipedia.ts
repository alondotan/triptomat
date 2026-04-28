/**
 * Fetch a representative image for a place from Wikipedia.
 * Strategy: REST summary API first (most reliable), then pageimages API, then country-qualified variants.
 */
export async function fetchWikipediaImage(name: string, country?: string): Promise<string | null> {
  const variants = [
    name,
    ...(country ? [`${name}, ${country}`] : []),
    ...name.split(/\s*[&,\-–]\s*/).map(s => s.trim()).filter(Boolean),
  ];

  for (const variant of variants) {
    // Primary: Wikipedia REST summary API (returns thumbnail for most articles)
    try {
      const slug = encodeURIComponent(variant.trim().replace(/ /g, '_'));
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = await res.json();
        const src = data.thumbnail?.source ?? data.originalimage?.source ?? null;
        if (src) return src;
      }
    } catch { /* silent */ }

    // Fallback: pageimages API (only works when article has Wikidata page-image set)
    try {
      const params = new URLSearchParams({
        action: 'query',
        prop: 'pageimages',
        titles: variant,
        pithumbsize: '800',
        format: 'json',
        origin: '*',
      });
      const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = await res.json();
        const pages = (data?.query?.pages ?? {}) as Record<string, { missing?: boolean; thumbnail?: { source?: string } }>;
        const page = Object.values(pages)[0];
        if (page && !page.missing && page.thumbnail?.source) return page.thumbnail.source;
      }
    } catch { /* silent */ }
  }

  return null;
}
