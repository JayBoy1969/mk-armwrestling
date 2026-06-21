// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://mkarmwrestling.co.uk',
  output: 'server',
  // Cloudflare bindings (KV from wrangler.toml, secrets from .dev.vars) are
  // exposed on Astro.locals.runtime.env during `astro dev` automatically.
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
