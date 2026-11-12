# SPIKE Cleanup Pass 1 — Evidence-Based Removal Audit

Date: 2026-11-09
Source: `SPIKE_UNIFIED_SOCIAL_SYSTEM.zip` (Library version 7)
Supabase project inspected: `cjqpyndceqyqsijihxbb`

## Safety rules applied

- Preserve previously removed features; do not restore Live Streaming, Dating, Store, XP/Level, or removed backend tables/features.
- Preserve direct full-page Followers/Following navigation.
- Do not delete production data or remove database objects based only on an unused-index advisory.
- Treat historical migrations as immutable history; use a forward migration for any approved database change.
- Distinguish unused frontend references from possible external RPC/API consumers.

## Confirmed architecture

- Active browser follow mutations call `spike_set_follow_v1` through `js/spike-social.js`.
- No active frontend caller was found for `spike_toggle_follow_v1` or the older `toggle_spike_follow` RPC.
- `spike_toggle_follow_v1` is explicitly a compatibility wrapper around the canonical setter and should remain until legacy/external callers are ruled out.
- `toggle_spike_follow` is a legacy candidate for retirement; source search found no current frontend caller. External clients have not been inventoried, so no live drop was performed.
- `get_friends_public` is actively used by `friends.html` and the Feed pass flow. `get_friends` has no current frontend caller and is a retirement candidate, pending external-consumer verification.
- Current Followers and Following pages render their complete list views directly and load the shared `js/spike-social.js` / `js/spike-social-connections.js` services. No obsolete preview screen was found in those navigation paths.

## Notification trigger finding

The live `friend_requests` table has two triggers for pending-request notifications:

1. `trg_spike_friend_request_notifications` → `private.trg_friend_request_notifications`
2. `trg_sync_friend_request_notification` → `public.sync_friend_request_notification`

Both write a `friend_request` notification with the same `friend-request:<request-id>` event key on INSERT. The private handler also emits a `friend_declined` event on pending → declined. The public legacy handler upserts a pending notification on UPDATEs where status remains/returns to pending. Therefore, the pair is overlapping but not functionally identical. A safe consolidation should move the legacy re-pending behavior into the private handler, test insert/re-pending/decline/preference/idempotency cases, then remove the redundant public trigger and function in a forward migration. No live trigger/function was removed in this pass.

The follow notification path has one active `trg_spike_user_follow_notifications` trigger on `app_documents`; no duplicate follow notification trigger was identified in the live trigger inventory.

## Unreferenced source-file candidates

A repository-wide literal reference scan found these files are not loaded/referenced by current production HTML/JS paths:

- `js/spike-native-select.js` — legacy controller; current tests explicitly ensure pages do not load it.
- `js/spike-dm-realtime-calls-v1.js` — compatibility stub; current pages load v2.
- `js/feed-runtime-10.js` — old composer-rail script; no current page or runtime references it.
- `css/spike-native-select.css` — legacy select stylesheet; no current page loads it (some dead selectors remain inline in `profile.html`).
- `css/spike-feed-menu-layout-v2.css`
- `css/spike-feed-menu-layout-v3.css`
- `css/spike-feed.css` — tiny legacy/empty bridge stylesheet.
- `css/spike-index-authority-v3.css` — current index UX test explicitly treats it as legacy and forbids loading it.

These are strong file-removal candidates, but this pass did not delete them because the active protected-baseline manifest still tracks several of these files and a deliberate baseline maintenance step is needed to document approved removals without masking unrelated drift. The profile inline `.spike-select-*` selectors should be removed together with the dead native-select controller/styles, after verifying the page uses native selects only.

## Database index advisory

Supabase Performance Advisor reported 245 unused-index findings at 2026-11-09 07:20 UTC. This is a candidate list, not proof that every index is unnecessary: statistics may have reset, some indexes serve infrequent admin/moderation flows, and foreign-key indexes may be important for delete/update performance. The follow-state GIN index was also flagged unused by the advisor despite being a deliberate support index in the social data model. No index was dropped.

Next safe step: group the 245 findings by table and index definition; check primary/unique/foreign-key dependencies, query plans and stats age; only then remove truly duplicate/nonessential indexes in reviewed batches.

## Baseline and test status

- Full Node test suite: 629 tests total; 627 passed, 1 failed, 1 skipped.
- The one failure is the protected-baseline hash audit. It reports stale expected hashes for many existing changed files and expects ten leveling badge assets that are absent. Those removed leveling assets were not restored and the baseline was not regenerated to conceal drift.
- The skipped test is the optional browser accessibility audit because Playwright/browser dependencies are unavailable.
- Focused social tests in the archive remain passing according to the prior social implementation report; this pass re-ran the full test suite.

## Changes made in this pass

- No application source, production data, live database functions, triggers, indexes, or migrations were deleted or altered.
- Added this evidence report only.

## Recommended cleanup order

1. Retire proven dead local JS/CSS assets and their stale inline selectors; maintain the protected-baseline manifest narrowly and transparently.
2. Consolidate friend-request notification trigger behavior, then retire the redundant legacy trigger/function via a forward migration after regression tests.
3. Deprecate and then remove unreferenced RPCs `toggle_spike_follow` and `get_friends` only after external API consumers are ruled out.
4. Keep `spike_toggle_follow_v1` temporarily as a compatibility wrapper; remove only after confirming no older deployed client uses it.
5. Perform a dependency-aware CSS selector cleanup and index review; never bulk-drop the 245 advisor findings.
