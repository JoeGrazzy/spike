# SPIKE Live Stream Removal and Message Media Picker Repair

Date: 2026-10-11

## Source changes completed

- Removed the dedicated `live.html` page, `js/spike-live.js`, `js/spike-feed-live.js`, and `css/spike-live.css` from the active source.
- Removed the Feed Live rail, Start Live / See all Live actions, menu Go Live entry, their associated CSS rules, and the runtime click handler.
- Removed the duplicate `work/src` source snapshot so the package does not ship a second old copy of the application that could reintroduce the feature.
- Moved eight stream-specific Supabase migration scripts out of the active `supabase/migrations` folder and into `supabase/migrations-archive/live-stream-removed/`, so a fresh migration run will not recreate those objects from these scripts.
- Restored `message.html` from the SPIKE private-media implementation, including the native phone file picker, media-type choices, attachment selection/preview flow, and attachment-opening behavior.
- Added regression tests for stream removal, archived migrations, and the message media picker. Updated the protected-file manifest to record these intentional changes while keeping its integrity test enabled.

## Validation

- `npm run check`: 456 passed, 0 failed, 1 skipped (optional browser accessibility test unavailable because optional browser dependencies are not installed).
- Confirmed no streaming page/runtime/style/route references remain in active HTML, CSS, or runtime JavaScript.
- Confirmed no stream-specific migrations remain in the active migration directory.
- Confirmed the media picker button, file input, media type menu, selection handler, and attachment opener are present.

## Important deployment boundary

This is a source-package repair only. It has not been deployed. Moving migration scripts out of the active source directory does **not** drop already-created tables, functions, policies, storage buckets, or other objects in an existing Supabase project. Those production objects need an environment-specific inventory and reviewed decommission migration before deletion. Historical SQL remains in the archive intentionally; it is not loaded by the normal active migration directory.

Live two-account/device testing of the media picker and upload/render pipeline has not been performed in this environment.
