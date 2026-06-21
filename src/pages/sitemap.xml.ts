import type { APIRoute } from 'astro';
import { getAllPosts } from '../lib/blog';
import { getKV } from '../lib/runtime';

export const prerender = false;

const STATIC_PATHS = ['/', '/about', '/athletes', '/events', '/blog', '/contact'];

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://mkarmwrestling.co.uk')).origin;

  let posts: Awaited<ReturnType<typeof getAllPosts>> = [];
  try {
    posts = await getAllPosts(getKV());
  } catch {
    posts = [];
  }

  const entries = [
    ...STATIC_PATHS.map((path) => ({ loc: origin + path, lastmod: undefined as string | undefined })),
    ...posts.map((post) => ({ loc: `${origin}/blog/${post.slug}`, lastmod: post.date })),
  ];

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        (e) =>
          `  <url>\n    <loc>${e.loc}</loc>` +
          (e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : '') +
          '\n  </url>'
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
