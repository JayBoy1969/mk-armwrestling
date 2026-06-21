import type { APIRoute } from 'astro';
import { getKV } from '../../../lib/runtime';

export const prerender = false;

// Public — blog visitors load these images. Serves bytes stored in KV by
// /api/upload-image, using the content-type saved in the entry's metadata.
export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  const kv = getKV();
  if (!kv) {
    return new Response('Not found', { status: 404 });
  }

  const { value, metadata } = await kv.getWithMetadata(`image:${id}`, 'arrayBuffer');
  if (!value) {
    return new Response('Not found', { status: 404 });
  }

  const contentType = (metadata as { contentType?: string } | null)?.contentType ?? 'application/octet-stream';

  return new Response(value, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
