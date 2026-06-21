/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Bindings/vars exposed via `import { env } from "cloudflare:workers"`.
declare namespace Cloudflare {
  interface Env {
    /** KV namespace where blog posts are stored. */
    BLOG_KV: KVNamespace;
    /** R2 bucket for uploaded blog post images (shared with the videos bucket). */
    MEDIA: R2Bucket;
    /** Public base URL of the R2 bucket (its r2.dev domain), no trailing slash. */
    R2_PUBLIC_BASE_URL: string;
    /** Admin panel password (Pages secret in prod, .dev.vars locally). */
    ADMIN_PASSWORD: string;
    ANTHROPIC_API_KEY: string;
    UNSPLASH_ACCESS_KEY: string;
  }
}
