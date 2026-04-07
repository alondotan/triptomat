/**
 * Fetch a representative image for a place from Wikipedia (MediaWiki API).
 * Tries the full name, then parts split by common delimiters.
 */
export async function fetchWikipediaImage(name: string): Promise<string | null> {
  const nameParts = [
    name,
    ...name.split(/\s*[&,\-–]\s*/).map(s => s.trim()).filter(Boolean),
  ];

  for (const part of nameParts) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'pageimages',
      titles: part,
      pithumbsize: '800',
      format: 'json',
      origin: '*',
    });

    try {
      const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const pages = (data?.query?.pages ?? {}) as Record<
        string,
        { missing?: boolean; thumbnail?: { source?: string } }
      >;
      const page = Object.values(pages)[0];
      if (page && !page.missing && page.thumbnail?.source) {
        return page.thumbnail.source;
      }
    } catch {
      // silent — try next part
    }
  }

  return null;
}
