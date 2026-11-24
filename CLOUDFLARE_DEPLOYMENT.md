# SPIKE Cloudflare Workers deployment

## ZIP layout
- The archive contains one top-level folder named `SPIKE/`.
- Set the Cloudflare Pages/Workers project root directory to `SPIKE` (or enter `SPIKE/` before running Wrangler locally).
- Inside `SPIKE/`, the browser-facing website files remain at the application root (`index.html`, page HTML, `css/`, `js/`, `assets/`, etc.); URL paths remain rooted at `/`.
- `worker.js`: Worker entry point.
- `wrangler.jsonc`: Worker and static asset configuration.
- `supabase/`: database migrations and backend project files (not public assets).
- `scripts/`: local validation/test scripts.

## Cloudflare build settings
- Root directory: `SPIKE`
- Install command: `bun install`
- Deploy command: `npx wrangler deploy`
- Build output directory: leave empty

The static asset directory is `.` relative to `SPIKE/wrangler.jsonc`, so Cloudflare serves the root-level website layout from inside the `SPIKE/` folder. The root `.assetsignore` excludes `node_modules`, Wrangler/runtime files, tests, scripts, Supabase migrations, and Markdown reports from the public asset manifest. Keep `.assetsignore` inside `SPIKE/`; do not change the asset directory to `node_modules` or the whole repository without the ignore file.
