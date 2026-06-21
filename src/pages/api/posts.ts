import type { APIRoute } from 'astro';
import { getAllPosts } from '../../lib/blog';
import { getKV } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Auth-gated list of all posts (full content) for the admin manage/edit UI.
export const GET: APIRoute = async ({ cookies }) => {
  if (!(await isAuthenticated(cookies))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const kv = getKV();
  if (!kv) return json({ error: 'Blog storage (KV) is not configured' }, 500);

  return json(await getAllPosts(kv), 200);
};
