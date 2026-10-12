# SPIKE Typing Indicator Diagnostic V3

## User-reported failure
The typing indicator never appears in both direct messages and room chat.

## Findings from source inspection

### 1. Direct messages: private channel depends on a live database policy
`js/spike-dm-realtime-calls-v2.js` subscribes to a private channel named `spike:dm:<sorted-user-uuid>:<sorted-user-uuid>`. Private channel subscription and broadcast require matching policies on `realtime.messages` for both authenticated participants. The project includes migration `supabase/migrations/20261012150000_spike_dm_typing_realtime_authorization_v1.sql`, but this local workspace cannot establish whether that migration was applied to the live Supabase database. If it has not been applied, the channel will fail authorization and the indicator cannot arrive.

### 2. Room chat: sender selected `httpSend` instead of the joined channel's WebSocket send
The original room code preferred `channel.httpSend('typing', payload)` whenever that method existed, and only fell back to `channel.send(...)` if it did not. The room channel is created as a normal public Realtime channel. That made typing depend on a separate HTTP broadcast path instead of the already-subscribed channel transport, without confirming that the HTTP path was accepted by the project's channel mode. V3 now uses the documented subscribed-channel broadcast form `channel.send({type:'broadcast', event:'typing', payload})` only.

### 3. Channel readiness was not enforced for room typing
The room typing sender could attempt to broadcast before its presence/broadcast channel reached `SUBSCRIBED`. V3 adds `state.presenceReady`, sends typing only after subscription, logs channel status/errors, and retries the initial typing state if the user is already typing when subscription completes.

### 4. Cache invalidation
The shared DM/calls script URL was still versioned `sitewide-calls-v14`. V3 bumps the script reference to `sitewide-calls-v15` on `message.html` and `room_chat.html` so those pages fetch the updated diagnostics instead of relying on a cached script.

## Changes in V3
- Room typing uses `channel.send` only; removed the `httpSend` preference.
- Room typing waits for `SUBSCRIBED`, logs subscription failures, and retries typing state after a successful subscription.
- Direct-message channel logs already distinguish `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, and `CLOSED`; the cache-bust now ensures the updated script is fetched on the affected pages.
- Kept direct-message typing on a private participant-pair topic; no public fallback was introduced, because that would risk exposing private activity.
- Preserved one existing indicator element per UI and per-user timer handling; no additional indicator element or competing typing subsystem was added.
- Updated approved integrity hashes only for the two modified HTML files.

## Verification
- `npm test`: 483 tests total, 482 passed, 0 failed, 1 skipped (optional browser accessibility dependencies unavailable).
- JavaScript syntax and inline-script syntax checks are run separately during packaging.
- Archive integrity checked after packaging.

## Important limitation
This identifies concrete source-level failure paths, but the exact live deployment cause cannot be fully proven without seeing the deployed browser console/channel status and confirming whether the migration is applied in Supabase. No live database or production deployment was modified from this workspace.

## Required live verification
1. Deploy the V3 files, including `message.html`, `room_chat.html`, and `js/spike-dm-realtime-calls-v2.js`.
2. Apply `20261012150000_spike_dm_typing_realtime_authorization_v1.sql` through the project's normal Supabase migration process if it is not already applied.
3. Open each affected page as two authenticated accounts and inspect the console.
4. Direct messages should log `[SPIKE DM typing] Private typing channel subscribed: ...`. If instead they log `Private typing channel unavailable`, inspect the deployed `realtime.messages` policies/session.
5. Room chat should log `[SPIKE room typing] Room broadcast channel subscribed: ...`. If it logs `Room broadcast channel unavailable`, the room's Realtime connection/configuration is the remaining blocker.
