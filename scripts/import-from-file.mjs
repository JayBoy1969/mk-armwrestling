#!/usr/bin/env node
// Import a downloaded HTML page into the blog.
//
// Reads an HTML file, strips it to plain text, asks /api/import-post to rewrite
// it into an original post draft, then /api/publish-post to save it. Prints the
// published URL.
//
// Usage:
//   node scripts/import-from-file.mjs <path-to.html> [options]
//
// Options:
//   --image <url>        Use this image URL (R2 etc.) instead of an Unsplash pick
//   --image-file <path>  Upload a local image to R2 (/api/upload-image) and use it
//   --source <url>    Original source URL, passed to the model for context
//   --guidance <text>    Verified facts / editorial guidance the rewrite must follow
//   --date <YYYY-MM-DD>  Publish date (defaults to today)
//   --base <url>      Site base URL (default: env SITE_BASE or http://localhost:4321)
//
// Auth:
//   Set ADMIN_PASSWORD in the environment (sent as "Authorization: Bearer ...").
//   e.g.  ADMIN_PASSWORD=mkaw2026 node scripts/import-from-file.mjs article.html
//
// On Windows PowerShell, set it inline like:
//   $env:ADMIN_PASSWORD = 'mkaw2026'; node scripts/import-from-file.mjs article.html

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { argv, env, exit } from 'node:process';

function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--image') opts.image = args[++i];
    else if (a === '--image-file') opts.imageFile = args[++i];
    else if (a === '--source') opts.source = args[++i];
    else if (a === '--guidance') opts.guidance = args[++i];
    else if (a === '--date') opts.date = args[++i];
    else if (a === '--base') opts.base = args[++i];
    else if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      exit(1);
    } else positional.push(a);
  }
  return { opts, positional };
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  pound: '£',
  copy: '©',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

// Strip an HTML document to readable plain text. Dependency-free and good enough
// to feed a language model — drops scripts/styles/markup and collapses whitespace.
function htmlToText(html) {
  let text = html;
  // Remove non-content elements entirely (including their contents).
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, ' ');
  // Treat block-level breaks as newlines so paragraphs survive.
  text = text.replace(/<\/(p|div|section|article|h[1-6]|li|br|tr)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Drop all remaining tags.
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  // Collapse whitespace; keep paragraph breaks.
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

// Upload a local image to R2 via /api/upload-image and return its public URL.
async function uploadImage(url, password, path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const type = MIME_BY_EXT[ext];
  if (!type) {
    throw new Error(`Unsupported image type ".${ext}" (use jpg/png/webp/gif/avif/svg)`);
  }
  const bytes = await readFile(path);
  const form = new FormData();
  form.append('image', new File([bytes], basename(path), { type }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${password}`,
      // Astro's CSRF check requires multipart POSTs to carry a same-origin
      // Origin header (JSON POSTs are exempt). Node's fetch omits it, so set it.
      Origin: new URL(url).origin,
    },
    body: form,
  });
  const raw = await res.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}: ${payload?.error || payload?.raw || res.statusText}`);
  }
  return payload.url;
}

async function postJson(url, password, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${password}`,
    },
    body: JSON.stringify(body),
  });
  let payload;
  const raw = await res.text();
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!res.ok) {
    const msg = payload?.error || payload?.raw || res.statusText;
    throw new Error(`${url} -> ${res.status} ${res.statusText}: ${msg}`);
  }
  return payload;
}

async function main() {
  const { opts, positional } = parseArgs(argv.slice(2));

  const filePath = positional[0];
  if (!filePath) {
    console.error('Usage: node scripts/import-from-file.mjs <path-to.html> [--image url] [--image-file path] [--source url] [--guidance text] [--date YYYY-MM-DD] [--base url]');
    exit(1);
  }

  const password = env.ADMIN_PASSWORD;
  if (!password) {
    console.error('Error: ADMIN_PASSWORD environment variable is not set.');
    console.error("  PowerShell:  $env:ADMIN_PASSWORD = 'mkaw2026'; node scripts/import-from-file.mjs article.html");
    exit(1);
  }

  const base = (opts.base || env.SITE_BASE || 'http://localhost:4321').replace(/\/$/, '');

  console.log(`Reading ${filePath} ...`);
  const html = await readFile(filePath, 'utf8');
  const content = htmlToText(html);
  if (!content) {
    console.error('Error: no readable text found in the file after stripping HTML.');
    exit(1);
  }
  console.log(`Extracted ${content.length} characters of text.`);

  // Resolve the image: a local file (uploaded to R2) wins over a bare --image URL.
  let imageUrl = opts.image;
  if (opts.imageFile) {
    console.log(`Uploading image ${opts.imageFile} via /api/upload-image ...`);
    imageUrl = await uploadImage(`${base}/api/upload-image`, password, opts.imageFile);
    console.log(`  Uploaded: ${imageUrl}`);
  }

  console.log('Rewriting via /api/import-post ...');
  const draft = await postJson(`${base}/api/import-post`, password, {
    content,
    sourceUrl: opts.source,
    guidance: opts.guidance,
    customImageUrl: imageUrl,
  });

  console.log(`  Title:   ${draft.title}`);
  console.log(`  Image:   ${draft.image}`);

  console.log('Publishing via /api/publish-post ...');
  const published = await postJson(`${base}/api/publish-post`, password, {
    title: draft.title,
    body: draft.body,
    excerpt: draft.excerpt,
    image: draft.image,
    date: opts.date,
  });

  const url = `${base}/blog/${published.slug}`;
  console.log('\nPublished:');
  console.log(`  ${url}`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  exit(1);
});
