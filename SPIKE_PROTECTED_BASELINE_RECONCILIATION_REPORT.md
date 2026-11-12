# SPIKE Protected Baseline Reconciliation

**Date:** 2026-11-11  
**Reason:** Reconcile a stale 2026-09-22 integrity manifest with the current, reviewed SPIKE archive after accumulated intentional UI, runtime, and stylesheet changes.

## Approved retired files

The ten orphan badge images from the permanently removed XP/leveling feature were removed from the active baseline and added to `js/audit/protected-baseline-exclusions.json`. Their original hashes remain preserved in `docs/audit-baselines/protected-baseline-original-2026-09-22.json`. The retirement is documented in `SPIKE_ORPHAN_BADGES_REMOVAL_REPORT.md`; the assets were not restored.

## Updated active-file fingerprints

The active protected files whose bytes differed from the stale manifest were re-fingerprinted against the supplied archive. No migration files were changed by this reconciliation. The manifest's file count was recomputed after the ten documented retirements.

Updated paths:
- `admin.html`
- `css/feed-core.css`
- `css/feed-features.css`
- `css/room-chat-core.css`
- `css/spike-feed-command-menu-v4.css`
- `css/spike-five-theme-authority.css`
- `css/spike-ux-refinement-v1.css`
- `css/ui-fix.css`
- `feed.html`
- `friends.html`
- `guide.html`
- `help.html`
- `index.html`
- `js/audit/protected-baseline-exclusions.json`
- `js/audit/tests/admin-edge-functions.test.mjs`
- `js/audit/tests/feed-menu-action-dismiss-v10-7.test.mjs`
- `js/audit/tests/no-leveling-system.test.mjs`
- `js/audit/tests/page-responsibilities.test.mjs`
- `js/audit/tests/post-action-bar-v4.test.mjs`
- `js/audit/tests/profile-privacy-controls.test.mjs`
- `js/audit/tests/protected-baseline-exclusions.test.mjs`
- `js/audit/tests/public-profile-activity-visibility.test.mjs`
- `js/feed-runtime-04-1.js`
- `js/feed-runtime-04-2.js`
- `js/feed-runtime-04-3.js`
- `js/spike-dialog.js`
- `js/theme.js`
- `legal.html`
- `message.html`
- `messages.html`
- `notifications.html`
- `policy.html`
- `policy_appeals.html`
- `profile.html`
- `reset-password.html`
- `room.html`
- `room_chat.html`
- `rooms.html`
- `settings.html`
- `share.html`
- `spike-tools.html`
- `supabase/functions/admin-user-ops/index.ts`
- `view_user.html`

## Verification policy

This does not weaken the audit: every remaining protected path must exist and match its byte count and SHA-256 digest; all excluded paths must be absent and traceable to the immutable historical baseline. New active files remain outside the protected set until separately reviewed.


## Admin follow-up reconciliation
The reviewed admin.html follow-up adds a scroll container around the Room Members table and fixes the header connection-status lifecycle. Its active-file fingerprint is updated in the current reviewed baseline; no historical migration or backend source was changed in this follow-up.


## Notifications Pulse rebuild — 2026-11-12
The `notifications.html` presentation and in-list interaction layer was intentionally rebuilt. Its reviewed byte count and SHA-256 fingerprint are recorded in the active protected baseline. Existing notification SQL migrations, RPC contracts, shared realtime helper, authentication recovery, identity/avatar integration, theme bootstrap, adaptive navigation, and sound preferences were retained. No notification database migration was added or modified.
