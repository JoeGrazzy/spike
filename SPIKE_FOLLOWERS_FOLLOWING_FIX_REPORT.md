# SPIKE Followers & Following Fix

## Implemented

- Followers and Following statistic buttons open their requested list directly in one tap.
- Both lists use the existing full-screen connections surface; no intermediate preview screen or preview card is used.
- The list fills the viewport on mobile and desktop, with the member list taking the available scroll area.
- Selecting a member row opens that member's profile directly. The redundant extra `Profile` action was removed.
- Existing search, sorting, pagination, follow/unfollow, block/report, and privacy-aware RPC flow are preserved.
- Added migration `20261108152000_spike_profile_follow_lists_reliability_v5.sql` to make follower/following retrieval work with canonical `users/{uuid}` documents even when `owner_id` is absent, and to resolve display information from either `profiles` or the user document.
- Updated follower/following count calculation to use the same legacy-compatible identity rules.
- Added five regression tests for direct opening, full-screen layout, direct profile navigation, legacy document lookup, and count consistency.

## Verification

- Targeted profile social-list tests: **9 passed, 0 failed**.
- Inline JavaScript syntax checks extracted from `profile.html`: **passed**.
- Full project check: **580 passed, 2 failed, 1 skipped** (583 total).
- The two full-suite failures are existing archive/baseline problems: missing legacy badge assets and protected-baseline hash differences. They are unrelated to this Followers/Following change.
- Browser-based visual testing was not run because the optional browser dependencies are not installed.

## Deployment note

The SQL migration is included in the project but has **not** been applied to a live Supabase project. Apply the new migration before deploying the updated `profile.html`; otherwise the browser may continue calling the previous database function definition.
