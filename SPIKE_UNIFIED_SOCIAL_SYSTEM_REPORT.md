# SPIKE Unified Social Relationship System — Final Implementation Report

**Status:** Social relationship consolidation and live Supabase database changes completed. Website hosting deployment and real-device browser acceptance testing remain outstanding.

## Objective

Make Follow, Unfollow, Followers, Following, counts, relationship state, and Mutual Connections use one consistent system. Preserve existing SPIKE functionality and do not restore removed features.

## Final architecture

- One canonical relationship store remains `app_documents` → `users/{uuid}` → `data.following`.
- One shared browser service: `js/spike-social.js`.
- All active UI mutation paths now call the explicit desired-state operation `SPIKE.social.setFollow(...)`.
- The canonical database mutation is `spike_set_follow_v1(target, desired_state)`. It is idempotent: repeating the same desired state returns `changed: false` and does not rewrite the user document or create duplicate follow events.
- The old `spike_toggle_follow_v1` remains only as a compatibility wrapper delegating to the setter. Current SPIKE pages do not call it directly.
- Counts, lists, mutual connections, and relationship-state reads use the same privacy/discoverability and symmetric block rules.
- Friend requests and friendships remain separate from Follow/Unfollow.
- No second follow table or duplicate counter store was introduced.

## Work completed

### Frontend consolidation

- Added/maintained `js/spike-social.js` as the common service for relationship mutations, following-state reads, counts, paginated lists, and mutuals.
- Updated Profile, Other User Profile, Feed profile popup, Followers, Following, and Mutuals to use the shared service.
- All follow buttons send the intended state (`true` or `false`) instead of issuing a blind toggle.
- Feed profile popup disables its Follow/Unfollow action while the request is in progress to prevent rapid double-clicks.
- Followers and Following stat navigation opens the full dedicated page directly; the dedicated pages retain server-side search and pagination.
- Bumped relevant script cache keys to `unified-social-v2` and the Feed action runtime to `menu-action-dismiss-v10.8-unified-social-v2`.
- Removed duplicate client-side follow-array writes and page-specific follow RPC calls.

### Database consistency and security

- `spike_update_profile_v1` preserves the server-managed `following` array and takes the same per-user advisory lock as Follow/Unfollow, preventing a profile edit from restoring stale relationship JSON.
- `spike_set_follow_v1` performs an idempotent desired-state mutation, validates current profile visibility/discoverability and both block stores even for repeated follow requests, normalizes legacy string/object IDs, and updates the canonical document only when the state changes.
- `spike_toggle_follow_v1` delegates to the idempotent setter for backward compatibility.
- Follow mutations and Feed block/unblock operations now take deterministic pair advisory locks. The Feed block trigger locks both account IDs before insert/delete, matching the pair-lock order used by the Follow setter and existing DM block operation.
- `get_spike_profile_follow_counts`, `get_spike_profile_social_list_v2`, and `get_spike_mutual_connections` now apply the same symmetric `feed_blocks` and `private_message_blocks` filters.
- Follower counts and follower lists both use profile-backed canonical user documents. Owner Following counts and lists both retain valid stale UUID references as removable “profile not synced” rows; other viewers only see discoverable profiles.
- Mutual connections require both users to follow the same third-party account and filter for the viewer’s discoverability plus blocks between the viewer/owner and the mutual account.
- The follow notification/realtime trigger already normalizes legacy string and object entries. Because idempotent repeats do not write the user document, they do not generate duplicate follow notifications or realtime changes.
- Internal helper functions are not executable by `anon` or `authenticated`; public RPCs are executable by `authenticated` and not by `anon`.

## Live Supabase changes

Connected project: `cjqpyndceqyqsijihxbb`.

Applied migrations (the local source package includes matching migration files):

- `20261109064041` — protect follow state during profile edits and relationship reads.
- `20261109064833` — align social list, count, and mutual visibility/block filters.
- `20261109065103` — serialize profile writes with follow mutations.
- `20261109065451` — introduce the idempotent desired-state follow setter and compatibility wrapper.
- `20261109065726` — enforce visibility/block validation even for idempotent follow repeats.
- `20261109065811` — serialize Follow/Unfollow against Feed block/unblock operations.

### Live verification performed

- Verified the new functions compile and are present in the connected database.
- Verified `anon` cannot execute the social RPCs; `authenticated` can execute the intended public RPCs. Private helper functions are not directly executable by either role.
- Verified fixed `search_path` settings on the new security-definer RPCs.
- Ran read-only live checks with an authenticated test identity: its follower/following counts matched the returned list rows; server-side search found the expected result; the next offset returned no duplicate row; the other profile’s follower count matched its follower list.
- Verified repeating “follow=true” for an existing relationship returns `{following: true, changed: false}` and repeating “follow=false” for a non-relationship returns `{following: false, changed: false}`.
- Ran transactional block regression checks for both Feed and private-message blocks. Temporary test rows were deleted inside the test transaction; final `feed_blocks` and `private_message_blocks` row counts were zero. While temporarily blocked, counts/lists hid the relationship and the setter rejected a repeated follow request.
- Verified the Feed block pair-lock trigger is installed.
- Verified the existing GIN index on `app_documents.data->'following'` and indexes on both block tables remain present.
- No production follow relationships were changed by the verification tests.

### Data integrity item intentionally left untouched

The live database still has **3 canonical user documents with `owner_id IS NULL`**, and none of those document IDs match an `auth.users` record. There are no owner-ID mismatches or malformed `following` JSON arrays in the canonical user documents checked. These three ownerless documents were not backfilled or deleted because there is no safe account-owner match.

### Block behavior note

A Feed block hides the pair from Follow counts, Followers/Following lists, Mutual Connections, and relationship-state reads while the block is active. The Feed block does not itself delete the stored follow edge; unblocking can reveal that edge again. The existing private-message block RPC retains its existing behavior of removing both follow directions and cleaning pending friend-request relationships.

## Tests

- Focused social/database regression suite: **47 passed, 0 failed**.
- All JavaScript files under `js/`: `node --check` passed.
- Inline scripts: Profile 8/8, Other User Profile 2/2, Feed 5/5, Followers 1/1, Following 1/1, Mutuals 1/1 passed syntax checks.
- Full project suite: **629 tests; 627 passed, 1 failed, 1 skipped**.
- The remaining failure is the existing protected-baseline audit. Its 2026-09-22 manifest still expects the old `admin.html` hash, the ten leveling badge images that have already been removed from SPIKE, and older hashes for several existing CSS/HTML files. Those removed assets were not restored, and the protected baseline manifest was not regenerated to conceal the drift.
- The skipped test is the optional browser accessibility test because Playwright/browser dependencies are not installed in this workspace.
- Supabase advisors still report existing project-wide warnings. The social RPCs are intentionally callable by authenticated users and are not callable by `anon`; the advisor’s generic authenticated-`SECURITY DEFINER` warning also flags these intended authenticated RPCs.

## Deployment boundary

- Live Supabase migrations have been applied.
- The updated HTML/JS source package has been prepared, but the website host/CDN has **not** been deployed from this workspace.
- A real two-account browser acceptance test on the deployed site remains outstanding. The live SQL behavior and source regression checks passed, but this report does not claim a production browser rollout.
- No removed feature was restored, and no new duplicate relationship store was added.
