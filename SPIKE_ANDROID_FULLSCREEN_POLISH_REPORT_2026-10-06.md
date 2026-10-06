# SPIKE Android Full-Screen Polish — v6

Date: 2026-10-06

## Starting point and protection

- Built from the separately versioned known-good reference `SPIKE-Menu-Tap-Guard-2026-10-06.zip` (SHA-256 `dcdc20e6be0409b864638e7695c41605a7ddb4c7f14dcf32e31c596ca679687f`).
- The known-good ZIP was not modified in place.
- The original `SPIKE.zip` remains unchanged (SHA-256 `5d2cc409ac405beab41b5a4ab8575becfce93eeca660d929b3033265ae89f67c`).

## Root causes found from the source

1. `feed.html` had an unconditional `#spikeBottomNav { display:none !important; ... }` rule, while later styles attempted to display `.spike-bottom-nav`. The ID selector won, so the bottom navigation was hidden in the Feed despite the visible-navigation rules.
2. `js/spike-identity.js` only installed broken-image fallback handlers on avatar images carrying gender/fallback metadata. Remote avatar URLs without that metadata could remain as broken image icons with alt text, as seen in the supplied screenshot.
3. The mobile Feed styling used large story tiles and several competing layout overrides. This patch adds a final, explicit Android/mobile layout layer instead of continuing to append unrelated overrides to the old rules.

## Changes made

- Added `css/spike-android-fullscreen-v1.css` and linked it from all 33 HTML pages for shared full-width/viewport defaults, media width safety, tap highlight handling, visible keyboard focus, and reduced-motion support.
- Added `css/spike-android-feed-v1.css` for the Feed: compact story tiles, cleaner section spacing, balanced For You/Following tabs, responsive media height, safe bottom clearance, and a visible five-item bottom navigation.
- Removed the unconditional bottom-navigation hide rule from `feed.html`. Existing conditional hiding while the composer is expanded remains intact.
- Updated `js/spike-identity.js` so remote avatar images without gender metadata receive a graceful initials fallback if loading fails.
- Added `js/audit/tests/android-fullscreen-polish.test.mjs` for shared stylesheet coverage, Feed navigation visibility, and avatar fallback wiring.
- Updated only the 34 affected entries in the protected baseline manifest (33 HTML pages and `js/spike-identity.js`). All other protected entries were left unchanged.

## Verification

- `npm run check`: passed; 389 tests total, 388 passed, 0 failed, 1 skipped.
- `node --check js/spike-identity.js`: passed.
- Focused Android full-screen regression tests: 3 passed, 0 failed.
- No Supabase migrations, RLS policies, database functions/triggers, storage policies, or voice-note pipeline files were changed.

## Limitations

A headless Chromium screenshot attempt timed out in this environment, so visual rendering was not independently confirmed in a browser. No Android APK was built or installed, and no physical-device/WebView runtime test was performed. The package is a source-level responsive polish repair; device verification is still required before claiming the APK is fully validated.
