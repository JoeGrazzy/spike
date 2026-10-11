# SPIKE Live Stream Removal Report

Date: 2026-10-11

## Scope completed in this source archive

- Removed `live.html`, the dedicated stream page.
- Removed `js/spike-live.js` and `js/spike-feed-live.js`.
- Removed `css/spike-live.css` and live-rail styling from shared Feed/theme/menu stylesheets.
- Removed the Feed live rail, Start Live / See all Live controls, and menu entry.
- Removed the live-rail-specific test and updated route/audit lists.
- Added regression tests asserting the active application has no live-stream entry points or runtime asset references.
- Preserved unrelated generic notification broadcasts, messaging realtime, and non-stream "live updates" functionality.

## Backend and historical files

Historical Supabase migrations referring to `spike_live_*` are retained as migration history. They are not imported by the active UI after this change. Existing deployed database objects, data, policies, storage, and Edge Functions have NOT been dropped or changed. Deleting those safely requires a reviewed, environment-specific database decommission migration and backup because this archive alone cannot establish whether every object is exclusive to streaming.

## Validation

Run `npm run check`. The new `js/audit/tests/live-stream-removal.test.mjs` checks for accidental reintroduction in active HTML/CSS/JS. Browser and live-hosting validation still need to be performed after deployment.
