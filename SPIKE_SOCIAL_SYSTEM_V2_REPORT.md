# SPIKE Social System V2 — implementation report

## Delivered

- Added `get_spike_profile_social_list_v2`, with server-side search across the full authorized Followers / Following result set, pagination, privacy checks, and legacy string/object relationship support.
- Added `mutuals.html` and `get_spike_mutual_connections`. Mutuals are defined as accounts that the viewer and the profile owner both follow. The RPC applies profile-visibility, discoverability, and block checks before returning profile data.
- Added a direct “See mutual connections” entry on other members' profiles and on authorized Followers / Following pages. The link remains hidden if the connection list is private.
- Added private Realtime `user:<uuid>:social` broadcasts for both sides of follow/unfollow changes. The RLS policy permits the account owner or a viewer currently authorized to see that profile's connections; blocked viewers are excluded.
- Updated the follow-notification trigger to normalize legacy string IDs and object IDs (`id` / `user_id`), create follow notifications through the existing preference-enforcing notification pipeline, and broadcast social changes to connected devices.
- Added Realtime refresh and a 60-second visible-page fallback to the dedicated social pages.
- Added live social refresh to profile pages.
- Added notification-channel refresh and fallback polling to the friend-request screen.
- Preserved the existing separate friend-request/friendship model and the existing direct Followers / Following navigation (no preview screen).

## Live Supabase migrations

Both migrations are applied to the connected Supabase project and confirmed in migration history:

- `20261108150155_spike_social_system_v2`
- `20261108150328_spike_social_realtime_profile_visibility_v1`

The two new public RPCs are executable by `authenticated` and not by `anon`. Realtime subscription authorization is enforced through `realtime.messages` RLS.

## Verification

- 7/7 focused Social System V2 tests passed.
- `node --check` passed for the changed JavaScript files.
- Inline script syntax checks passed for `friends.html`, `profile.html`, `followers.html`, `following.html`, and `mutuals.html`.
- Full `npm run check`: 605 tests total, 602 passed, 2 failed, 1 skipped.
- The two remaining failures are in the supplied archive's existing baseline: legacy badge assets are missing, and the protected-baseline manifest does not match multiple files already present in the supplied archive. The optional browser accessibility test remains skipped because browser dependencies are unavailable.
- Database smoke tests exercised the new list and mutual RPCs, and a two-account object-form follow/notification test inside a transaction that was rolled back. No test relationship changes or test notifications were retained.
- Supabase advisors still report the two new `SECURITY DEFINER` RPCs as callable by `authenticated`; this is intentional for RPC access. Both explicitly deny `anon`. The project also has existing broader advisor findings unrelated to this change.

## Deployment boundary

The database migrations are live. The updated website files in this package have **not** been uploaded to the website host. Deploy the updated HTML, JavaScript, and migration files from this package to make the V2 interface available to users.

A real two-account browser/WebSocket session test was not possible in this environment because no test-account credentials or browser automation dependencies were available. The database-level two-account smoke test passed.
