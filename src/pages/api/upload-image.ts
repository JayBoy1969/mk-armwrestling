import type { APIRoute } from 'astro';
import { getMediaBucket, getSecret } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

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

  const bucket = getMediaBucket();
  const publicBase = getSecret('R2_PUBLIC_BASE_URL');
  if (!bucket || !publicBase) {
    return json({ error: 'Image storage (R2) is not configured' }, 500);
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
    return json({ error: 'Image must be 25 MB or smaller' }, 413);
  }

  const ext = EXT_BY_TYPE[file.type] ?? 'bin';
  const key = `blog-images/${crypto.randomUUID()}.${ext}`;

  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  // Served directly from the bucket's public r2.dev domain.
  return json({ url: `${publicBase.replace(/\/$/, '')}/${key}` }, 200);
};
