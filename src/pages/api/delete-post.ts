import type { APIRoute } from 'astro';
import { deletePost } from '../../lib/blog';
import { getKV } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';

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

  const kv = getKV();
  if (!kv) return json({ error: 'Blog storage (KV) is not configured' }, 500);

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { slug } = (data ?? {}) as Record<string, unknown>;
  if (typeof slug !== 'string' || !slug.trim()) {
    return json({ error: 'A post slug is required' }, 400);
  }

  await deletePost(slug.trim(), kv);
  return json({ success: true }, 200);
};
