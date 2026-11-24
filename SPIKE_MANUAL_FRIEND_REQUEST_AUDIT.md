# SPIKE Manual Friend Request Audit

Date: 2026-11-24
Supabase project: Spikemediachat (`veagqanfilmbchlvlpcc`)
Input archive: `SPIKE_STANDARDIZED_ENGINEERING_AUDIT_BUILD.zip`

## Scope and file resolution

The supplied archive contains `friends.html`; it does not contain `frames.html`. The requested changes were applied to `friends.html` and its controller, `js/spike-friends-controller.js`.

## Product behavior changed

- Removed the QR-based Add path from the Friends page. Discover cards now show **Add friend**.
- The action calls `window.SPIKE.social.sendFriendRequest(db, targetId)`, which calls `spike_send_friend_request(p_target_user_id)`.
- After a successful request, the page refreshes friends, incoming/outgoing requests, suggestions, and Discover.
- Incoming requests keep Accept / Decline; outgoing requests keep Cancel request.
- Replaced QR instructions in empty states and page copy with manual discovery/request guidance.
- Profile QR features outside `friends.html` were not removed; the request was scoped to the Friends page.

## Supabase changes applied live

Two additive migrations were applied to the connected Supabase project:

1. `20261124101914_spike_manual_friend_request_policy_v1`
   - `follows_insert_self` now allows only the caller's own `pending` request rows.
   - Direct insertion is denied when either side has blocked the other.
   - Removed `follows_accept_target`, preventing clients from turning a single request row into a one-way accepted relationship. Acceptance must use the atomic RPC.
2. `20261124102041_spike_friend_request_notification_language_v1`
   - Changed new pending-request notification type/title/body to `friend_request` / `Friend request` / `sent you a friend request.`
   - Preserved the rest of the existing social/message notification trigger.

PostgREST schema reload was requested after the policy changes.

## Live verification

The connected project is `ACTIVE_HEALTHY`. The following checks passed:

- Required friend/discovery/block RPCs exist.
- All 12 checked RPCs are executable by `authenticated` and not executable by `anon`.
- `follows_insert_self` is pending-only and block-aware.
- Direct client acceptance policy is absent.
- Friend-request notification function contains the new notification type and wording.
- Existing discovery RPC filters private, inactive, already-connected, and blocked accounts.

## Local validation

- `node --check` passed for the changed JavaScript files.
- Automated test suite: 46 passed, 0 failed.
- Messages page smoke test passed.
- Project validator passed: 62 JavaScript files, 28 HTML pages, 64 CSS files, local references, Worker config, and migration versions.
- ZIP integrity check passed after packaging.

## Remaining verification boundary

This environment does not have two separately authenticated production browser sessions or a physical Android device. Therefore the final real-account sequence (Account A sends, Account B sees request/notification, Account B accepts, both see each other under Friends) still needs a live device/browser smoke test. No claim of physical-device testing is made.
