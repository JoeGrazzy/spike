# SPIKE Cloudflare Workers deployment

## Repository layout
- `public/`: browser-facing website files only. URL paths remain rooted at `/`.
- `worker.js`: Worker entry point.
- `wrangler.jsonc`: Worker and static asset configuration.
- `supabase/`: database migrations and backend project files (not public assets).
- `scripts/`: local validation/test scripts.

## Cloudflare build settings
- Root directory: `/`
- Install command: `bun install`
- Deploy command: `npx wrangler deploy`
- Build output directory: leave empty

The static asset directory is `./public`; do not change it to `.`. `node_modules` is outside the configured assets directory.
