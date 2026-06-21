export interface BlogPost {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  body: string;
  image: string;
}

const KEY_PREFIX = 'post:';
const SEEDED_KEY = 'meta:seeded';

// The JSON files under src/content/blog are bundled at build time and used once
// to seed KV (see ensureSeeded). After that, every post lives in KV so it can
// be edited and deleted from the admin panel.
const seedModules = import.meta.glob<{ default: BlogPost }>('../content/blog/*.json', {
  eager: true,
});
const SEED_POSTS: BlogPost[] = Object.values(seedModules).map((m) => m.default);

function sortByDateDesc(posts: BlogPost[]): BlogPost[] {
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// One-time migration: copy the bundled seed posts into KV, then mark it done so
// they're never re-added (which would resurrect deleted seed posts).
async function ensureSeeded(kv: KVNamespace): Promise<void> {
  if (await kv.get(SEEDED_KEY)) return;
  for (const post of SEED_POSTS) {
    const existing = await kv.get(KEY_PREFIX + post.slug);
    if (!existing) await kv.put(KEY_PREFIX + post.slug, JSON.stringify(post));
  }
  await kv.put(SEEDED_KEY, '1');
}

export async function getAllPosts(kv?: KVNamespace): Promise<BlogPost[]> {
  if (!kv) return sortByDateDesc([...SEED_POSTS]);
  await ensureSeeded(kv);
  const { keys } = await kv.list({ prefix: KEY_PREFIX });
  const stored = await Promise.all(keys.map((k) => kv.get<BlogPost>(k.name, 'json')));
  return sortByDateDesc(stored.filter((p): p is BlogPost => p !== null));
}

export async function getPostBySlug(slug: string, kv?: KVNamespace): Promise<BlogPost | null> {
  if (!kv) return SEED_POSTS.find((post) => post.slug === slug) ?? null;
  await ensureSeeded(kv);
  return (await kv.get<BlogPost>(KEY_PREFIX + slug, 'json')) ?? null;
}

export async function savePost(post: BlogPost, kv: KVNamespace): Promise<void> {
  await kv.put(KEY_PREFIX + post.slug, JSON.stringify(post));
}

export async function deletePost(slug: string, kv: KVNamespace): Promise<void> {
  await kv.delete(KEY_PREFIX + slug);
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
