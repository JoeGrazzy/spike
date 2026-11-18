# SPIKE source structure

This source tree uses semantic asset filenames. Internal CSS/JS filenames no longer encode patch or release numbers. Distinct spatial modules are named by responsibility (core, layout, structure). The feed runtime fragments are consolidated into `js/feed-runtime.js`; the feed loader remains a separate `js/spike-feed-loader.js` module at its original execution point. Feed CSS source fragments are consolidated into `css/feed-foundation-bundle.css` and `css/feed-experience-bundle.css`; redundant standalone copies are not retained.

## Conventions
- Keep one canonical implementation per feature; extend the canonical file instead of adding numbered variants.
- Keep page-specific styles in clearly named modules and shared styles in shared modules.
- Do not add cache-busting query strings manually; deployment cache policy belongs in hosting configuration.
- Keep compatibility redirect pages (`legal.html`, `mutuals.html`, `view_user.html`) lightweight.
- Run `npm test` (or `node --test tests/*.test.mjs`) before every release. The tests check retired calling code, canonical asset names, duplicate IDs/references, and missing local assets.

## Backend boundary
This package is still a frontend source handoff. Server-backed authentication, persistent data, messaging, notifications, wallet, uploads, and room features require a newly owned backend and integration tests. No browser-only cleanup can make those remote services operational.

## Feed CSS deduplication
`css/feed-experience-bundle.css` no longer repeats 96 exact rule blocks that are already supplied by standalone authority stylesheets loaded later by `feed.html`. Keep the standalone files and their HTML load order intact. Do not re-add those repeated rules to the bundle unless the page loading arrangement changes.

## Deep cleanup guardrails
- The source-integrity suite verifies every JavaScript module is referenced by a page and every inline JavaScript block parses successfully.
- Do not delete functions, event handlers, timers, observers, or selectors based only on text-search counts. Dynamic DOM insertion, delegated events, lifecycle hooks, and cross-page globals must be considered before removal.
