# SPIKE Cleanup Pass 2 — Confirmed Dead Asset Retirement

Date: 2026-11-09
Source: SPIKE Cleanup Pass 1 package (Library version 7)

## Completed removals

Removed eight files after checking production HTML/JS references and runtime load paths:

- `js/spike-native-select.js` — legacy controller; current audit tests already forbid loading it.
- `js/spike-dm-realtime-calls-v1.js` — obsolete v1 compatibility stub; active pages use v2.
- `js/feed-runtime-10.js` — superseded composer-rail runtime with no current page/runtime references.
- `css/spike-native-select.css` — unused legacy select stylesheet.
- `css/spike-feed-menu-layout-v2.css` and `css/spike-feed-menu-layout-v3.css` — superseded layouts not loaded by active pages.
- `css/spike-feed.css` — 145-byte legacy bridge stylesheet with no active imports.
- `css/spike-index-authority-v3.css` — explicitly treated as legacy by current index UX tests and not loaded.

Removed the orphaned `.spike-select-*` / `.sst-*` inline CSS selectors from `profile.html`. Native select controls remain; no replacement control was introduced.

## Baseline bookkeeping

- Removed only these eight retired paths from the active protected-baseline manifest.
- Added them to the explicit exclusion ledger, preserving their original hashes in the immutable historical manifest.
- Updated the exclusion regression test to require the intentional-retirement rationale.
- Did not regenerate the entire protected baseline and did not hide unrelated baseline drift.

## Verification

- `npm test`: 621 tests; 619 passed, 1 failed, 1 skipped.
- The sole failure remains `no protected baseline file was deleted or modified`, due to pre-existing protected-baseline drift: `admin.html` hash mismatch and ten previously absent leveling badge assets. No leveling assets were restored.
- One optional browser accessibility test remains skipped because browser dependencies are unavailable.
- `node --check` passed for all JavaScript files under `js/`.
- Confirmed no remaining native-select legacy selectors in `profile.html`.
- Confirmed all eight retired files are absent.

## Not changed

No Supabase tables, user data, RPCs, triggers, indexes, or production migrations were modified. No user-facing features were removed. Followers/Following direct-page navigation and unified social relationship service remain intact.

## Next safe stage

Review and consolidate friend-request notification trigger behavior in a new forward migration. Before changing production, validate INSERT, re-pending UPDATE, decline, notification preferences, idempotency, and realtime event cases in a rollback-safe test transaction. Retire legacy RPCs only after external consumers are ruled out.
