# SPIKE Presence & Typing Rebuild — Implementation Report

## Implemented in this build

- Added `js/spike-dm-signals.js` as the shared direct-message typing contract for the inbox and individual conversation page.
- Standardized the private pair topic as `spike:dm-typing:v1:<sorted-user-uuid>:<sorted-user-uuid>` and centralized subscription, participant validation, and publish payloads.
- Updated `messages.html` to use the shared typing manager while preserving the inbox's bounded subscription count and existing render behavior.
- Updated `message.html` to use the same manager, start shared presence for the other participant, render presence state in the conversation header, and hydrate privacy-filtered last-seen data.
- Removed the duplicate DM typing channel and global input/blur typing handlers from `js/spike-dm-realtime-calls-v2.js`. Call signaling and call UI logic remain in that module.
- Reduced typing broadcasts: the conversation sends `typing: true` on the transition into typing rather than on every keystroke; it sends `typing: false` on blank input, idle timeout, blur, message submit, page exit, and connection failure cleanup.
- Updated cache-busting versions for the changed shared call runtime.
- Added automated tests for canonical topic sorting, participant filtering, privacy-safe payloads, shared page integration, and typing lifecycle behavior.

## Supabase changes verified/applied

- Live audit found that the frontend expected `spike_touch_user_presence()` while the deployed database exposed the secure `touch_user_presence(p_user_id, p_current_page)` function. The frontend now calls the deployed function with the authenticated user's ID and current page; the server function rejects attempts to update another user's row.
- Applied migration `20261013141653_spike_presence_rpc_reconcile_v1` (`spike_presence_rpc_reconcile_v1`) to add the missing `spike_get_user_presence(uuid[])` RPC. It returns at most 100 requested IDs, requires authentication, and filters users who have disabled online-status visibility.
- Revoked direct `anon` and `authenticated` table privileges on `public.user_presence` and removed the obsolete owner table policy. Verified afterward that neither role can directly select/insert/update/delete that table.
- Verified that `touch_user_presence` and `spike_get_user_presence` are `SECURITY DEFINER` functions with execution granted to `authenticated` and not `anon`/`public`.
- Verified that `private_messages` is in `supabase_realtime` and that the live typing policies are pair-scoped, require an existing DM in either direction, and deny typing channels when either participant has blocked the other.
- Restored a source migration file for the deployed typing authorization policy so the project source reflects the live policy model.

## Automated verification

- `npm run check`: **551 passed, 0 failed, 1 skipped**. The skipped check requires optional Playwright/browser dependencies.
- JavaScript syntax checks passed for the new shared signals manager, the presence timestamp helper, and the call runtime.
- All inline scripts extracted from `messages.html` and `message.html` passed `node --check`.
- Shared manager unit tests verify topic ordering, participant validation, and that the typing broadcast contains only `from`, `to`, and a boolean `typing` value.

## Still requiring real-device confirmation

The available environment did not provide two authenticated browser sessions/devices, so I have **not** claimed a live two-account typing/presence test. Before production sign-off, test with two accounts:

1. Open the inbox for account A and the DM page for account B.
2. Type from each side and verify the matching inbox row and DM indicator update in both directions.
3. Verify typing clears on submit, blanking the composer, blur, navigation, and disconnect.
4. Verify online/offline and last-seen state across two tabs, reconnect, and privacy-disabled profiles.
5. Verify blocked participants cannot subscribe to or publish on the pair topic.
6. Confirm existing message delivery and voice/video calls still work in the same authenticated session.

No unrelated database policies were removed. Supabase security/performance advisor output still contains findings for other SPIKE features outside this task; those were not changed as part of this focused rebuild.
