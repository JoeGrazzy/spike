# SPIKE Cleanup Pass 4 — Profile Social List Service Unification

Date: 2026-11-09
Source: SPIKE Cleanup Pass 3 package / active SPIKE workspace

## Completed

- Migrated the remaining profile overlay's blocked-member list read from the legacy `get_spike_profile_social_list` RPC to the shared `window.SPIKE.social.getList(...)` service.
- This leaves profile blocked-list reads on the same v2 RPC contract already used by the dedicated Followers, Following, and Mutuals surfaces: `get_spike_profile_social_list_v2`.
- Kept owner-only blocked-list access. The shared service still accepts only the established `followers`, `following`, and `blocked` list kinds, and the database function retains its owner check for `blocked`.
- Kept pagination, profile rendering, unblock/report/block controls, and the existing overlay behavior unchanged.
- Updated the profile social audit test to assert that the profile delegates list retrieval to the shared service and that the service calls the v2 RPC.

## Legacy RPC dependency audit (read-only)

Live Supabase project `cjqpyndceqyqsijihxbb` was inspected:

- `get_spike_profile_social_list(uuid,text,integer,integer)` still exists and is executable by `authenticated`; after this pass, no current frontend callsite remains in the source tree. External/deployed consumers have not been ruled out, so it was **not dropped**.
- `toggle_spike_follow(uuid)` remains an authenticated compatibility endpoint with no current frontend callsite found. It was **not dropped** because external/deployed consumers are unknown.
- `spike_toggle_follow_v1(uuid)` remains an authenticated compatibility wrapper; it is deliberately retained for older clients.
- `get_friends(integer,integer)` is not executable by `authenticated` in the live grants inspected (only `postgres` and `service_role`); it was not changed.
- No production database schema, data, grants, RPCs, triggers, indexes, or migrations were changed.

## Verification

- Full audit suite: 620 tests; 618 passed, 1 failed, 1 skipped.
- The one failure remains the known protected-baseline drift: `admin.html`, ten historical leveling badge files absent from this source package, and existing CSS hash differences. The baseline was not regenerated and the absent leveling assets were not restored.
- One optional browser accessibility test remains skipped because Playwright/browser dependencies are unavailable.
- `node --check` passed for every JavaScript file in the project.
- ZIP integrity checked after packaging.

## Not changed

- No removed SPIKE feature was restored.
- No user-facing functionality was removed.
- Canonical follow storage remains `app_documents` → `users/{uuid}` → `data.following`.
- Follow/unfollow mutations remain routed through `SPIKE.social.setFollow` and `spike_set_follow_v1`.
- Dedicated Followers and Following pages continue to open directly, with server-side pagination and privacy-aware reads.

## Deferred safely

- Dropping legacy RPCs: external/deployed consumer inventory is still required.
- Friend-request trigger consolidation: preserve re-pending unread reset, decline notification, idempotency, preferences, and realtime semantics before any production migration.
- Duplicate CSS/event handlers: no removal based solely on superficial text similarity; runtime ownership and cascade behavior need proof.
- Unused-index advisor findings: each index requires workload/query-plan review before removal.
