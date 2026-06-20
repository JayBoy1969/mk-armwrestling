# MKAwrestling Project Guide

## Stack
- **Framework**: Astro (static site generator / hybrid)
- **Styling**: Tailwind CSS
- **Language**: JavaScript/TypeScript
- **Node.js**: 18+

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

## Deployment
- Deploy to: _(specify: Netlify, Vercel, GitHub Pages, etc.)_
- Build output: `dist/`
- Environment variables: _(add .env.example with required vars)_

## Common Tasks
- **New page**: Create `.astro` file in `src/pages/`
- **New component**: Add to `src/components/`, import in pages
- **Update styles**: Add Tailwind classes directly in components

## Notes for AI Agents
- Ask before making breaking changes to layouts or component structure
- Ensure all new features are tested via dev server before building
- Keep components small and focused; decompose large layouts
