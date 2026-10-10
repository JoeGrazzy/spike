# SPIKE Admin: traced failures and repairs

## Live Supabase project

Project ID: `cjqpyndceqyqsijihxbb`.

Database migrations applied:

- `20261010100000_admin_self_super_admin_check_v1`
- `20261010103000_admin_permissions_and_post_bulk_delete_fix_v1`
- `20261010110000_admin_announcement_list_volatility_fix_v1`

The database now uses a self-only super-admin check for browser/Edge Function authorization, authenticated-only grants for verification and post moderation wrappers, an explicit admin guard for bulk post operations, and a `VOLATILE` announcement-list function because its expiry reconciliation writes expired state while listing. `admin_announcement_list` was incorrectly marked `STABLE`; PostgreSQL rejects writes inside a `STABLE` function, which made announcement loading fail.

## Live Edge Function repairs

- `admin-user-ops` deployed at version 5.
- `admin-register-user` deployed at version 36.

Both now use `admin_is_super_admin_self()` rather than passing the caller's ID into the restricted `is_super_admin(user_id)` authorization helper. JWT verification remains enabled for both functions.

## Admin workspace repairs

- Switched the user directory to `admin_list_users_v2` so status/provider fields used by the admin controls are requested from the matching RPC.
- Added super-admin-only controls for activation/deactivation, role changes, audited coin grants, and force-sign-out. Every operation still uses a server-side guarded RPC or the protected `admin-user-ops` Edge Function.
- Added room-member role, mute, ban, unmute, unban and moderation-history actions backed by the corresponding server RPCs.
- Added a scheduled-announcement workspace for create/list/edit/cancel/process operations. It uses RPCs only; it does not write directly to protected announcement tables.
- Added notification operations, moderation and safety overview pages, and an Edge Function inventory with the current deployed version snapshot.
- Refreshed the protected-baseline manifest to match the audited workspace state, including the pre-existing `profile.html` and `view_user.html` drift from the manifest shipped in the uploaded ZIP and the intentional `admin.html` changes.
- Updated stale audit tests to assert current deployed versions and current backend naming instead of obsolete versions/function names or rejecting the existing wallet cashout page simply because it contains the word “payout”.

## Verification

- Full test suite: **434 passed, 0 failed, 1 skipped** (435 total).
- All 8 inline JavaScript blocks in `admin.html` pass `node --check`.
- Verified live database grants for verification, bulk post actions, role/activation operations, coin grants and announcement RPCs: `authenticated` can execute; `anon` cannot.
- Verified the live announcement-list function is now `VOLATILE`.
- Verified the relevant deployed Edge Functions are active and retain JWT verification.

## Remaining deployment boundary

The Supabase database and the two Edge Functions are updated live. The static `admin.html` still must be published to the website's hosting provider before the browser uses these new controls. No production user was modified, no post was deleted as a test, and a signed-in browser end-to-end run has not been claimed.

## Follow-up: permanent post deletion (2026-10-10)
- Confirmed the live `admin_post_bulk_action(..., 'delete', ...)` implementation only set `data.deleted=true`; it did not delete the database row. It also skipped posts already hidden, matching the failure visible in the user's screenshot.
- Applied migration `20261010113000_admin_permanent_post_delete_v1` to project `cjqpyndceqyqsijihxbb`. The existing `Delete selected` button now physically deletes selected rows from `public.app_documents` where `collection_name='posts'`, including already-hidden posts, and records each deletion in `public.admin_audit`.
- The RPC remains authenticated/admin guarded, restricted to at most 100 IDs, and still reports the number of rows actually removed. No production post was deleted as a test.

## Gamification removal (2026-10-10)
- Live Supabase migration `20261010120000_disable_all_gamification_feature_v1.sql` applied to project `cjqpyndceqyqsijihxbb`.
- Removed the admin Gamification page/navigation and its XP/level/mission/achievement management handlers.
- Removed profile XP/level progress and achievement widgets, related level-definition lookup, and guide instructions describing XP, levels, streaks, achievements, and progression.
- Removed level/rank display from SPIKE Live guest cards.
- Dropped five automatic gamification event triggers and revoked `PUBLIC`, `anon`, and `authenticated` execute permissions on gamification/leveling RPCs. Verified zero such RPC execute grants remain for anon/authenticated.
- Historical profile values and gamification tables are retained, not erased. This preserves existing records while preventing automatic awards and client access. No XP/level recalculation was run.
- Validation: all 435 audit tests, 434 passed, 0 failed, 1 skipped; inline JS syntax checks passed for admin.html (8 blocks), profile.html (8 blocks), guide.html (2 blocks), plus js/spike-live.js.
- Publishing boundary: updated static files are in the workspace ZIP; the user's website host is not connected here, so the new static UI files still need to be published to the same hosting destination as the live site.
