# SPIKE Profile & Social Connections Upgrade

## Delivered

- Added dedicated `followers.html` and `following.html` full-page destinations.
- Profile Followers and Following counters now navigate directly to the matching page.
- The followers/following routes are guarded in the legacy profile list handler, so they cannot open the old profile overlay.
- Member avatar/name rows navigate directly to `profile.html?uid=...`; no profile preview step is used.
- Added server-paginated list loading (30 records per request), search over loaded rows, count display, and load-more control.
- Added follow/unfollow using `spike_toggle_follow_v1`, count refresh using `get_spike_profile_follow_counts`, and owner-only report/block actions.
- Preserved the existing blocked-members and profile-post overlay flows; those are separate from Followers/Following.
- Added regression tests for direct navigation, dedicated pages, pagination, profile links, transactional follow actions, and existing privacy-aware SQL.

## Changed files

- `profile.html`
- `followers.html` (new)
- `following.html` (new)
- `js/spike-social-connections.js` (new)
- `js/audit/tests/profile-followers-following-direct-v2.test.mjs`

The existing migration `supabase/migrations/20261108152000_spike_profile_follow_lists_reliability_v5.sql` is retained and used by the new pages. No new database schema migration was required for this UI refactor.

## Verification

- `node --check js/spike-social-connections.js`: passed
- `node --check js/profile-page.js`: passed
- Focused social regression tests: 10 passed, 0 failed
- Full `npm run check`: 586 passed, 2 failed, 1 skipped (589 total)

The two full-suite failures are:
1. Legacy level badge asset directory is absent from the supplied archive.
2. Protected-baseline integrity test reports existing project drift / modified protected files. The manifest was not rewritten to hide this failure.

The optional browser accessibility audit remains skipped because Playwright/browser dependencies are not installed in this project environment.

## Deployment note

These are source archive changes only. They have not been deployed to hosting, and no live Supabase migration or production data was changed. The existing follow-list migration must already be applied in the target Supabase project for the RPCs to be available.
