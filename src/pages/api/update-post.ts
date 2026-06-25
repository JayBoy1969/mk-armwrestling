import type { APIRoute } from 'astro';
import { getPostBySlug, savePost, type BlogPost } from '../../lib/blog';
import { getKV } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Edit an existing post. The slug + date are preserved (so URLs don't break);
// title, excerpt, body, and image can change.
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

  const { slug, title, body, excerpt, image, date } = (data ?? {}) as Record<string, unknown>;

  if (typeof slug !== 'string' || !slug.trim()) {
    return json({ error: 'A post slug is required' }, 400);
  }
  if (typeof title !== 'string' || !title.trim()) {
    return json({ error: 'Title is required' }, 400);
  }
  if (typeof body !== 'string' || !body.trim()) {
    return json({ error: 'Body is required' }, 400);
  }

  const existing = await getPostBySlug(slug.trim(), kv);
  if (!existing) {
    return json({ error: 'Post not found' }, 404);
  }

  const updated: BlogPost = {
    ...existing,
    title: title.trim(),
    body: body.trim(),
    excerpt:
      typeof excerpt === 'string' && excerpt.trim()
        ? excerpt.trim()
        : body.trim().slice(0, 150) + '…',
    image: typeof image === 'string' && image.trim() ? image.trim() : existing.image,
    date:
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : existing.date,
  };

  await savePost(updated, kv);
  return json({ success: true, slug: updated.slug }, 200);
};
