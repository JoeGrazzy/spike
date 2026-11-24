# SPIKE Cloudflare Workers deployment

## Repository layout
- The archive root contains the browser-facing website files (`index.html`, page HTML, `css/`, `js/`, `assets/`, etc.). URL paths remain rooted at `/`.
- `worker.js`: Worker entry point.
- `wrangler.jsonc`: Worker and static asset configuration.
- `supabase/`: database migrations and backend project files (not public assets).
- `scripts/`: local validation/test scripts.

## Cloudflare build settings
- Root directory: `/`
- Install command: `bun install`
- Deploy command: `npx wrangler deploy`
- Build output directory: leave empty

The static asset directory is `.` so Cloudflare serves the root-level website layout. Keep development dependencies out of the deployment archive and review which non-page files are present before publishing.
