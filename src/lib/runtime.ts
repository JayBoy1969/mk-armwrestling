import { env } from 'cloudflare:workers';

/**
 * Cloudflare bindings/vars in Astro v6 are read from the `cloudflare:workers`
 * virtual module (the old `Astro.locals.runtime.env` was removed). During
 * `astro dev` these are populated from wrangler.toml (KV) and .dev.vars (secrets).
 */

export function getKV(): KVNamespace | undefined {
  return env.BLOG_KV;
}

export function getSecret(key: keyof Cloudflare.Env): string | undefined {
  const value = env[key];
  if (typeof value === 'string') return value;
  // Fallback for local dev if a value is only present in .env.
  return (import.meta.env as Record<string, string | undefined>)[key as string];
}
