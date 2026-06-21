import type { APIRoute } from 'astro';
import { getKV } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (KV value limit is 25 MB)

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
  if (!kv) {
    return json({ error: 'Image storage (KV) is not configured' }, 500);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return json({ error: 'No image file provided' }, 400);
  }
  if (!file.type.startsWith('image/')) {
    return json({ error: 'File must be an image' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: 'Image must be 10 MB or smaller' }, 413);
  }

  const bytes = await file.arrayBuffer();
  const id = crypto.randomUUID();

  await kv.put(`image:${id}`, bytes, { metadata: { contentType: file.type } });

  return json({ url: `/api/image/${id}` }, 200);
};
