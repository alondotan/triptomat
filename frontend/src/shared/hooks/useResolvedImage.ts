import { useState, useEffect, useCallback } from 'react';

interface ImageSource {
  photo_url?: string | null;
  image?: string | null;
  imageUrl?: string | null;
}

async function fetchWikipediaImage(name: string): Promise<string | null> {
  const wikiName = name.replace(/ /g, '_');
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.originalimage?.source || data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

type Phase = 'static' | 'wiki' | 'done';

/**
 * Resolves an image URL for display with progressive fallback:
 *   photo_url → image → imageUrl → Wikipedia
 *
 * Usage:
 *   const { url, onError } = useResolvedImage({ imageUrl: poi.imageUrl }, poi.name);
 *   <img src={url} onError={onError} />
 *
 * - If a static URL exists, it is used first.
 * - When the static image fails (onError), Wikipedia is fetched automatically.
 * - If no static URL exists, Wikipedia is fetched proactively.
 */
export function useResolvedImage(
  source: ImageSource,
  name: string,
): { url: string | null; onError: () => void } {
  const staticUrl = source.photo_url || source.image || source.imageUrl || null;

  const [url, setUrl] = useState<string | null>(staticUrl);
  const [phase, setPhase] = useState<Phase>(staticUrl ? 'static' : 'wiki');

  // Reset when the static source changes (e.g. POI switches)
  useEffect(() => {
    const s = source.photo_url || source.image || source.imageUrl || null;
    setUrl(s);
    setPhase(s ? 'static' : 'wiki');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.photo_url, source.image, source.imageUrl]);

  // Fetch Wikipedia when entering 'wiki' phase
  useEffect(() => {
    if (phase !== 'wiki') return;
    let cancelled = false;
    fetchWikipediaImage(name).then(wikiUrl => {
      if (cancelled) return;
      setUrl(wikiUrl);
      setPhase('done');
    });
    return () => { cancelled = true; };
  }, [phase, name]);

  // Called from <img onError>: static URL failed → try Wikipedia
  const onError = useCallback(() => {
    setUrl(null); // hide broken img immediately
    setPhase('wiki');
  }, []);

  return { url, onError };
}
