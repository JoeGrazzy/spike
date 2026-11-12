# SPIKE Notifications — Pulse Rebuild

**Date:** 2026-11-12  
**Scope:** `notifications.html` presentation and in-list interaction rebuild.

## Delivered
- Replaced the oversized activity hero with a compact, responsive Pulse header.
- Added time grouping: Now, Today, This week, and Earlier.
- Added priority accents driven by the existing `priority` and `smart_score` fields.
- Added inline friend-request Accept/Decline actions using the existing `get_friend_requests`, `accept_friend_request`, and `decline_friend_request` RPCs.
- Added room invitation Join/Later actions using the existing same-origin deep link and read-state RPC.
- Added a Policy case link using the existing policy deep link.
- Added High signal focus and persisted Comfortable/Compact density controls.
- Made search expandable and added skeleton/quiet states.
- Added keyboard focus styling, ARIA labels/live updates, larger touch targets, and reduced-motion handling.

## Preserved
- `get_smart_notification_page`, notification summary, read, bulk-read, clear, and delete RPC contracts.
- Existing notification SQL migrations; no new migration or schema change was introduced.
- Private Supabase Realtime channel, BroadcastChannel, polling fallback, and scroll-aware silent refresh.
- Supabase auth recovery, presence startup, actor profile hydration, identity/avatar integration, sound/browser notification preferences, theme bootstrap, adaptive bottom navigation, and deep-link resolution.
- Existing shared notification badge helper and sound helper.

## Verification
- Inline JavaScript syntax: passed.
- Duplicate HTML IDs: none found.
- Existing notification-centre tests: 6/6 passed.
- Full project audit suite: 636/636 passed.
- Protected baseline: updated with the reviewed `notifications.html` fingerprint and this intentional change recorded.

## Runtime verification boundary
The automated tests validate source contracts and project regressions. A live authenticated browser session against the deployed Supabase project was not available in this build environment, so actual account-specific friend actions, room joins, browser notifications, and realtime delivery still require a deployed-device smoke test.
