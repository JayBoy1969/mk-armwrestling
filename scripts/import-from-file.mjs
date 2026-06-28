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

// Google recommends article images be at least 1200px wide for rich results.
const MIN_WIDTH = 1200;

// Read pixel dimensions straight from the file header — dependency-free.
// Handles PNG, GIF, JPEG and WebP (VP8/VP8L/VP8X). Returns null if unknown.
function imageSize(buf) {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF: width/height as little-endian uint16 at offset 6.
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // JPEG: walk the marker segments to the Start-Of-Frame (SOFn).
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      // SOF0–SOF15 carry the frame size, except DHT(C4)/JPG(C8)/DAC(CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + buf.readUInt16BE(off + 2); // skip this segment
    }
  }
  // WebP: RIFF container, then a VP8 / VP8L / VP8X chunk.
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8X') {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (fourcc === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

// BBC images come from ichef.bbci.co.uk/images/ic/<W>x<H>/<id>.jpg at many
// sizes. If the chosen rendition is below MIN_WIDTH, rewrite the URL to a
// proportional >=1200px one (keeping aspect ratio). No-op for other hosts.
function upgradeBbcImageUrl(url) {
  const m = url.match(/^(https?:\/\/ichef\.bbci\.co\.uk\/images\/ic\/)(\d+)x(\d+)(\/.+)$/i);
  if (!m) return url;
  const w = parseInt(m[2], 10);
  const h = parseInt(m[3], 10);
  if (w >= MIN_WIDTH) return url;
  const newH = Math.round((MIN_WIDTH * h) / w);
  return `${m[1]}${MIN_WIDTH}x${newH}${m[4]}`;
}

// Upload a local image to R2 via /api/upload-image and return its public URL.
async function uploadImage(url, password, path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const type = MIME_BY_EXT[ext];
  if (!type) {
    throw new Error(`Unsupported image type ".${ext}" (use jpg/png/webp/gif/avif/svg)`);
  }
  const bytes = await readFile(path);

  // Warn (don't block) if the image is below Google's recommended width — you
  // can't upscale quality back in, so this flags it before it goes live.
  const dim = imageSize(bytes);
  if (dim && dim.width) {
    if (dim.width < MIN_WIDTH) {
      console.warn(
        `  ⚠ image is ${dim.width}×${dim.height}px — below the ${MIN_WIDTH}px width Google recommends for article images.`
      );
      console.warn('    Consider sourcing a larger original; upscaling won’t restore real detail.');
    } else {
      console.log(`  image dimensions: ${dim.width}×${dim.height}px (ok)`);
    }
  }

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
  } else if (imageUrl) {
    // For a bare --image URL, auto-upgrade small BBC renditions to >=1200px.
    const upgraded = upgradeBbcImageUrl(imageUrl);
    if (upgraded !== imageUrl) {
      console.log(`  Upgraded BBC image to >=${MIN_WIDTH}px: ${upgraded}`);
      imageUrl = upgraded;
    }
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
