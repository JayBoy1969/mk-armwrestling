# MKAwrestling Project Guide

## Stack
- **Framework**: Astro (SSR, `output: 'server'`) via the `@astrojs/cloudflare` adapter
- **Styling**: Tailwind CSS v4
- **Language**: JavaScript/TypeScript
- **Storage**: Cloudflare KV (`BLOG_KV`) for runtime-published blog posts
- **Node.js**: 22+

## Runtime bindings & secrets
- Cloudflare bindings/vars are read via `import { env } from "cloudflare:workers"`
  (see `src/lib/runtime.ts`: `getKV`, `getMediaBucket`, `getSecret`).
- Blog persistence lives in `src/lib/blog.ts` (KV `BLOG_KV`; the JSON files in
  `src/content/blog/` are bundled as read-only seed posts).
- Uploaded blog images go to R2 (`MEDIA` binding → `mk-armwrestling-videos`
  bucket) via `/api/upload-image`, and are served from the bucket's public
  r2.dev domain (`R2_PUBLIC_BASE_URL`). Unsplash images are hotlinked remote URLs.
- Admin auth is server-side: `src/lib/auth.ts` + `/api/login` + `/api/logout`;
  `/api/generate-post`, `/api/publish-post`, `/api/generate-image`, and
  `/api/upload-image` reject unauthenticated requests.
- Required secrets: `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, `ADMIN_PASSWORD`
  (local: `.env` / `.dev.vars`; production: Cloudflare Worker secrets).
  Bindings + `R2_PUBLIC_BASE_URL` are declared in `wrangler.toml`.

## Key Conventions

### Development
- Always run the dev server after completing a build or making significant changes
  ```bash
  npm run dev
  ```
- Build before testing production output:
  ```bash
  npm run build
  ```

### Styling & Design
- Use Tailwind CSS for all styling — no CSS files unless absolutely necessary
- Maintain consistent spacing, colors, and typography across all pages
- Mobile-first responsive design approach

### Version Control
- Prefer concise, descriptive commit messages (e.g., `feat: add wrestling schedule section`)
- Keep commits atomic and focused on one change
- **Always ask before deleting any files** — archive or comment out instead when possible

### File Organization
```
src/
  pages/           # Astro pages (auto-routed)
  components/      # Reusable Astro/React components
  layouts/         # Page layouts
  assets/          # Images, fonts, static files
  styles/          # Global CSS if needed
```

## Deployment (Cloudflare Pages)
- Connect the GitHub repo in Cloudflare Pages. Build command: `npm run build`;
  build output directory: `dist`.
- Create a KV namespace and bind it as `BLOG_KV`
  (`npx wrangler kv namespace create BLOG_KV`, then set the id in `wrangler.toml`
  or bind it in Pages → Settings → Functions → KV namespace bindings).
- Add env vars/secrets in the Pages project: `ANTHROPIC_API_KEY`,
  `UNSPLASH_ACCESS_KEY`, `ADMIN_PASSWORD`.
- Hero videos are hosted on a Cloudflare R2 public bucket (not committed) — see
  the R2 URLs in `src/pages/index.astro` and `src/pages/about.astro`.

## Common Tasks
- **New page**: Create `.astro` file in `src/pages/`
- **New component**: Add to `src/components/`, import in pages
- **Update styles**: Add Tailwind classes directly in components

## Notes for AI Agents
- Ask before making breaking changes to layouts or component structure
- Ensure all new features are tested via dev server before building
- Keep components small and focused; decompose large layouts
