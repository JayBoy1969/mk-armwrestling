export interface BlogPost {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  body: string;
  image: string;
}

const KEY_PREFIX = 'post:';

// The JSON files under src/content/blog are bundled at build time and act as
// read-only seed content, so the two original posts always appear even before
// anything is written to KV. Posts created at runtime live in KV and take
// precedence over a seed post with the same slug.
const seedModules = import.meta.glob<{ default: BlogPost }>('../content/blog/*.json', {
  eager: true,
});
const SEED_POSTS: BlogPost[] = Object.values(seedModules).map((m) => m.default);

function sortByDateDesc(posts: BlogPost[]): BlogPost[] {
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getAllPosts(kv?: KVNamespace): Promise<BlogPost[]> {
  const bySlug = new Map<string, BlogPost>();
  for (const post of SEED_POSTS) bySlug.set(post.slug, post);

  if (kv) {
    const { keys } = await kv.list({ prefix: KEY_PREFIX });
    const stored = await Promise.all(keys.map((k) => kv.get<BlogPost>(k.name, 'json')));
    for (const post of stored) if (post) bySlug.set(post.slug, post);
  }

  return sortByDateDesc([...bySlug.values()]);
}

export async function getPostBySlug(slug: string, kv?: KVNamespace): Promise<BlogPost | null> {
  if (kv) {
    const stored = await kv.get<BlogPost>(KEY_PREFIX + slug, 'json');
    if (stored) return stored;
  }
  return SEED_POSTS.find((post) => post.slug === slug) ?? null;
}

export async function savePost(post: BlogPost, kv: KVNamespace): Promise<void> {
  await kv.put(KEY_PREFIX + post.slug, JSON.stringify(post));
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
