# SPIKE Cleanup Pass 3 — Legacy Safe-Area CSS and Notification Trigger Audit

Date: 2026-11-09
Source: SPIKE Cleanup Pass 2 package / active SPIKE workspace

## Completed

- Removed `css/mobile-safe-area.css` after a repository-wide active-source scan found no HTML, JavaScript, or CSS import references. The active `css/spike-mobile-safe-area.css` remains loaded by app pages and was not changed.
- Updated `js/audit/protected-baseline.json` to remove only the retired path and corrected its file count.
- Added the retired path to `js/audit/protected-baseline-exclusions.json`; its original hash remains in the immutable historical manifest.
- Kept `css/spike-onboarding-v1.css`: it is dynamically injected by `js/spike-onboarding-v1.js`, despite not being linked directly from HTML.

## Live friend-request notification audit (read-only)

Inspected both live triggers and their function definitions on `public.friend_requests`:

- `trg_spike_friend_request_notifications` calls `private.trg_friend_request_notifications` for INSERT and status UPDATE. It emits a new friend-request notification through `private.emit_notification`, and emits `friend_declined` on pending-to-declined transitions.
- `trg_sync_friend_request_notification` calls `public.sync_friend_request_notification` for INSERT and status UPDATE while the new status is pending. It upserts the existing event key and explicitly sets `read = false` and `created_at = now()`.
- `private.emit_notification` uses `ON CONFLICT ... DO NOTHING`, so it does not preserve the legacy re-pending behavior by itself.

**Decision:** no production migration or trigger was changed. A safe consolidation must preserve the re-pending unread reset, event-key idempotency, decline notifications, actor metadata, notification preferences, and realtime behavior. Deleting either trigger before those cases are covered would risk a regression.

## Verification

- Full audit suite: 620 tests; 618 passed, 1 failed, 1 skipped.
- The one optional browser accessibility test remains skipped because Playwright/browser dependencies are unavailable.
- The sole failure is the pre-existing protected-baseline drift (including `admin.html`, the ten absent leveling badge assets, and other historical file-hash differences). The manifest consistency and intentional-exclusion tests pass; the old baseline drift was not hidden or “fixed” by restoring removed assets or regenerating the baseline.
- JavaScript syntax checks and ZIP integrity are run for this package before delivery.

## Not changed

- No production Supabase data, schema, RPCs, triggers, indexes, or migrations were changed.
- No user-facing features were removed.
- No removed SPIKE features were restored.
- The unified follow/follower/following service and direct Followers/Following pages remain intact.

## Deferred safely

- Friend-request trigger consolidation: pending a complete behavior-preserving migration and tests.
- Legacy RPC retirement: pending external-consumer verification.
- CSS selectors repeated across many files: not treated as dead code merely because selector names repeat; these styles participate in deliberate cascade/theme layers.
- Unused-index advisor findings: not treated as proof that indexes can be dropped.
