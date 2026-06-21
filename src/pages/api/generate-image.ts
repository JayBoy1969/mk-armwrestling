import type { APIRoute } from 'astro';
import { getSecret } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';
import { fetchUnsplashImage } from '../../lib/unsplash';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthenticated(cookies))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { imageSearchTerm, topic } = (body ?? {}) as {
    imageSearchTerm?: string;
    topic?: string;
  };

  const term =
    (typeof imageSearchTerm === 'string' && imageSearchTerm.trim()) ||
    (typeof topic === 'string' && topic.trim()) ||
    'arm wrestling';

  // random: true so each regenerate returns a different image.
  const image = await fetchUnsplashImage(term, getSecret('UNSPLASH_ACCESS_KEY'), { random: true });

  if (!image) {
    return json({ error: 'Could not fetch a new image' }, 502);
  }

  return json({ image }, 200);
};
