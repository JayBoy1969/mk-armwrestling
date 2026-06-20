import type { APIRoute } from 'astro';
import { savePost, getPostBySlug, generateSlug, type BlogPost } from '../../lib/blog';
import { getKV } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Ensure the generated slug is unique so a new post never silently overwrites
 * an existing one with the same title. Appends -2, -3, … until a free slug is found.
 */
async function uniqueSlug(base: string, kv: KVNamespace): Promise<string> {
  let slug = base;
  let n = 2;
  while (await getPostBySlug(slug, kv)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    if (!(await isAuthenticated(cookies))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const kv = getKV();
    if (!kv) {
      return json({ error: 'Blog storage (KV) is not configured' }, 500);
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { title, body, excerpt, image } = (data ?? {}) as Record<string, unknown>;

    if (typeof title !== 'string' || !title.trim()) {
      return json({ error: 'A non-empty "title" string is required' }, 400);
    }
    if (typeof body !== 'string' || !body.trim()) {
      return json({ error: 'A non-empty "body" string is required' }, 400);
    }

    // generateSlug can return '' for titles with no latin characters — guard it.
    const baseSlug = generateSlug(title) || `post-${Date.now()}`;
    const slug = await uniqueSlug(baseSlug, kv);

    const post: BlogPost = {
      title: title.trim(),
      slug,
      date: new Date().toISOString().split('T')[0],
      excerpt:
        typeof excerpt === 'string' && excerpt.trim()
          ? excerpt.trim()
          : body.trim().slice(0, 150) + '…',
      body: body.trim(),
      image: typeof image === 'string' && image.trim() ? image.trim() : '/images/hero.jpg',
    };

    await savePost(post, kv);

    return json({ success: true, slug: post.slug, message: 'Post published successfully' }, 200);
  } catch (error) {
    console.error('Publish post error:', error);
    return json({ error: 'Failed to publish post' }, 500);
  }
};
