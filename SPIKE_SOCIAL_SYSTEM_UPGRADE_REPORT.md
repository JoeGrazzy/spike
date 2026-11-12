# SPIKE Social System Audit & Upgrade Report

Date: 2026-11-08  
Scope: Profile follow relationships, dedicated Followers/Following pages, block actions, friend requests, notifications, social counts, and Supabase authorization.

## Live Supabase work completed

Project: `SPIKE` (`cjqpyndceqyqsijihxbb`)  
Database: PostgreSQL 17.6.1.166  
Applied migration: `spike_social_relationship_consistency_v6` (recorded as version `20261108145645`).

The migration was applied successfully and the resulting RPC permissions and index were verified.

### Changes deployed

1. **Legacy user-document ownership:** Follow mutations now accept a canonical `users/{uuid}` document when `owner_id` is NULL, while still rejecting a non-NULL owner mismatch. Successful mutations normalize the owner ID.
2. **Follow counts:** Counts now use the same UUID parsing and visibility rules as the social-list RPC. An owner can see and remove stale/unavailable Following references without the total silently disagreeing with the rendered list.
3. **Blocking:** A block now removes follow edges in both directions, removes the mutual friendship, cancels pending friend requests between the two accounts, and removes the related friend-request notifications.
4. **Friend-request inbox:** `get_friend_requests()` now filters out requests where either party has blocked the other.
5. **Index coverage:** Replaced the previous GIN index that excluded NULL-owner legacy rows with an index covering all user documents that contain a `following` field.
6. **Function permissions:** Verified `anon` cannot execute the follow toggle, block, friend-request listing, or follow-count RPCs. Authenticated users retain the intended access.

## Local source changes included

- The Followers and Following pages remain direct destinations; no preview layer was reintroduced.
- An unavailable/stale account in the owner's Following list now has a **Remove** action, so an orphaned follow reference can be cleaned up.
- A temporary failure reading the viewer's own follow-state no longer prevents the authorized list from loading. Follow controls are withheld until that state is available.
- Blocking refreshes the displayed count and synchronizes the local follow-state cache.
- Added focused regression tests for these behaviours and the v6 migration.

## Live verification

- Migration tool returned success.
- Confirmed the new `app_documents_users_following_gin_v2_idx` exists.
- Confirmed relevant RPCs are `SECURITY DEFINER` with `anon_execute = false` and `authenticated_execute = true`.
- Ran a read-only authenticated-context smoke test using an existing account. It completed without an exception and checked that the returned Followers and Following list sizes match their count RPC values for that account.
- Supabase security and performance advisors were rerun. They still report broad project-wide SECURITY DEFINER and unused-index findings. The relevant social RPCs are intentionally SECURITY DEFINER because they return restricted cross-user profile projections; anonymous execution is revoked. The new GIN index is currently marked unused, which is expected at the present low table volume and is not a reason to remove it.

## Live data observations

At audit time, the project contained a small amount of social data (7 user documents and 21 notifications). Three canonical user documents had NULL `owner_id`, but none matched an existing `auth.users` account, so the migration correctly did not assign ownership to those orphan records. The UI now presents stale Following entries as unavailable and allows the owner to remove them.

There were 5 pending friend requests and no already-blocked pending requests at audit time, so the migration did not delete any existing requests during deployment; it changes the behaviour of future block actions and inbox reads.

## Test results

`npm run check`:

- 593 passed
- 2 failed
- 1 skipped
- 596 total

All 13 focused social-list and relationship-consistency tests passed. The two full-suite failures are existing archive/baseline issues unrelated to this change:

1. Legacy level badge asset retention test: badge assets are absent from the supplied archive.
2. Protected baseline test: reports an existing `admin.html` hash difference and the same missing badge assets.

The optional browser-based test remains skipped because the browser dependency is not installed in this environment.

## Remaining recommendations

1. Add server-side search to the social-list RPC so search covers every page, not only rows already loaded in the browser.
2. Add mutual-connection indicators while keeping **Follow** (one-way) separate from **Friend request/Friends** (mutual friendship).
3. Add cross-device refresh/realtime updates for follower counts and relationship buttons. The current pages update after local actions but do not subscribe to a dedicated social relationship stream.
4. Keep the full block (`private_message_blocks`) distinct from the feed-only block (`feed_blocks`) and make that distinction clear in the UI.
5. Run a real browser acceptance test with at least two authenticated test accounts, including private profiles, blocked users, stale accounts, pagination, and concurrent follow/unfollow actions.

## Deployment note

The v6 database migration is deployed to the connected SPIKE Supabase project. The updated HTML/JavaScript source is packaged separately in `SPIKE_SOCIAL_SYSTEM_UPGRADED.zip`; it still needs to be copied to the website hosting environment to make the client-side improvements live.
