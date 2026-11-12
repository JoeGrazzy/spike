# SPIKE Rooms — Existing Calling System Only Build

This source build removes the experimental multi-person Room voice/video calling implementation and its Metered TURN integration. It preserves SPIKE's existing direct-message calling system and the rest of the Rooms feature set.

## Rooms message reliability
- `room_public_send_message_idempotent` now accepts a stable client-generated request UUID.
- A partial unique index enforces one accepted request per sender/request ID.
- Retries return the original accepted message rather than inserting a duplicate.
- The v2 migration serializes different sends by the same sender within a room so concurrent requests cannot both pass the slow-mode check.
- The RPC is executable by `authenticated`; `anon` and `PUBLIC` execution are revoked.
- The function validates the authenticated user, active room membership, channel, bans, mutes, chat lock, reply target, slow mode, and rate limit.

## Validation
- Targeted message-idempotency and existing-backend contract tests: 9 passed, 0 failed.
- Full `npm test`: 640 tests total — 638 passed, 1 failed, 1 skipped. The remaining failure is the pre-existing protected hash mismatch for `js/spike-room-v2.js`; the protected controller was not edited in this database fix.
- `node --check js/spike-room-v2.js` and `node --check js/spike-rooms-v2.js` pass.
- Live Supabase verification confirms the UUID column, partial unique index, function definition/search path, and execute grants. An unauthenticated-role execute check confirms `anon` cannot execute the RPC while `authenticated` can.
- Supabase migration ledger confirms both message-idempotency migrations are applied. Live schema verification confirms the UUID column, partial unique index, function definition/search path, and execute grants. `anon` cannot execute the RPC; `authenticated` can. A real authenticated end-to-end send/retry test with two user sessions is still required before production sign-off.

## Important
This ZIP is a source/test build, not a website deployment. The Supabase Room-call authorization policies have been rolled back. The Metered Edge Function now returns HTTP 410; Metered secrets still require manual removal in the Supabase Dashboard because secret deletion is not exposed by the available management interface.
