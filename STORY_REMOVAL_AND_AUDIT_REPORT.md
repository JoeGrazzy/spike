# SPIKE Story Removal and Audit Repair

Date: 2026-10-11

## Changes

- Removed the obsolete Story-only stylesheets `css/spike-story-compact-v1.css` and `css/spike-story-upload-v3.css`.
- Removed the unreferenced Story interaction bridge `js/feed-runtime-11.js`.
- Removed three obsolete Story-specific audit suites that expected Story UI/composer elements which the current Feed intentionally removes: `story-interaction-bridge.test.mjs`, `story-upload-v3.test.mjs`, and `story-visibility-v4.test.mjs`.
- Kept `feed-no-story-feature.test.mjs` as the regression guard that verifies Story UI, Story-only assets/tests, and the Story runtime stay absent.
- Updated `all-files.txt` to match the current file tree.
- Reviewed the 19 prior protected-baseline mismatches against the immediately preceding project package. All 19 were the same intentional cache-busting update from `sitewide-calls-v13` to `sitewide-calls-v14` in HTML script references. The protected baseline manifest was regenerated to record the reviewed state, rather than bypassing its test.
- Adjusted the Impact-removal regression scan to exclude `js/audit/protected-baseline.json`, which necessarily contains historical filenames/identifiers in its inventory; active HTML, application JS, and Edge Function sources remain scanned.

## Validation

- `npm run check`: **442 passed, 0 failed, 1 skipped**.
- JavaScript syntax check passed.
- The one skipped test is the optional live accessibility/browser audit, skipped because its optional browser dependencies are not installed.

## Deployment note

These are source/package changes only. No hosting deployment or live Supabase operation was performed.
