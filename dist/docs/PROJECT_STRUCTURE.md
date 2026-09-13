# SPIKE Project Structure

This repository keeps runtime files in stable locations so relative URLs and deployment behavior remain unchanged.

## Runtime
- Root `*.html` files: production application pages
- `css/`: application stylesheets
- `js/`: application JavaScript
- `assets/`: images, badges, icons, and audio
- `supabase/migrations/`: database migrations
- `supabase/functions/`: server-side Edge Functions, when present
- `dist/`: generated production artifact; deploy this directory for static hosting

## Engineering
- `js/audit/`: static audits, integrity checks, and automated tests
- `build.js`: production build script
- `package.json`: pinned development tooling and scripts
- `_headers`, `wrangler.jsonc`: deployment configuration

## Documentation
- `docs/`: project, hardening, implementation, audit, and structure documentation
- `docs/legal/`: copyright register and third-party notices
- `docs/audits/`: release audit reports
- `docs/reference/`: non-runtime reference material
- `legal/asset-provenance/`: asset provenance and hash records
- `supabase/legacy/`: legacy SQL kept outside the active migration stream

## Important
Do not move root HTML pages, `css/`, `js/`, `assets/`, or deployment configuration without updating all relative references and the build contract. The current layout is intentionally organized while preserving runtime paths.
