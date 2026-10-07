# SPIKE Rooms Deep Cleanup — 2026-10-06

## Scope
Traced the canonical Rooms package after the Rooms simplification pass, focusing on dead user-facing Room controls and their runtime bridges.

## Removed
- Obsolete Shop/Font-Pack fallback bridges from `room_chat.html`.
- Top Ranking recommendations entry point from Room member actions.
- Gift entry point from Room member actions.
- Corresponding unused ranking/gift client functions and user-action branches.
- Fixed the empty/malformed Room runtime bootstrap left by the bridge removal.

## Preserved
- Room messages, replies, reactions, pins, reports and deletion.
- Room channels and realtime subscriptions.
- Member/profile actions, mute, moderation, sharing and reporting.
- Room message styling backend/RPC contracts.
- All Supabase migrations and backend contracts.

## Verification
- `npm run check`: 387 passed, 0 failed, 1 skipped.
- Inline HTML JavaScript syntax checks pass.
- No production references remain to the removed Shop/Font-Pack/Ranking/Gift Room entry points.
- No `chat_room.html` production references found.
