/**
 * Fetch a landscape image URL from Unsplash for a search term.
 * Returns null if no key is configured or nothing is found.
 *
 * `random: true` uses the /photos/random endpoint so repeated calls return
 * different images (used by the "regenerate image" action).
 */
export async function fetchUnsplashImage(
  searchTerm: string,
  accessKey: string | undefined,
  opts: { random?: boolean } = {}
): Promise<string | null> {
  if (!accessKey || accessKey === 'your_unsplash_access_key_here') return null;

  const query = encodeURIComponent(searchTerm.trim() || 'arm wrestling');

  try {
    if (opts.random) {
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape&client_id=${accessKey}`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { urls?: { regular?: string } };
      return data.urls?.regular ?? null;
    }

    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape&client_id=${accessKey}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ urls?: { regular?: string } }> };
    return data.results?.[0]?.urls?.regular ?? null;
  } catch (e) {
    console.error('Unsplash API error:', e);
    return null;
  }
}
