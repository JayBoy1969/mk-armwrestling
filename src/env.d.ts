/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Bindings/vars exposed via `import { env } from "cloudflare:workers"`.
declare namespace Cloudflare {
  interface Env {
    /** KV namespace where blog posts are stored. */
    BLOG_KV: KVNamespace;
    /** Admin panel password (Pages secret in prod, .dev.vars locally). */
    ADMIN_PASSWORD: string;
    ANTHROPIC_API_KEY: string;
    UNSPLASH_ACCESS_KEY: string;
  }
}
