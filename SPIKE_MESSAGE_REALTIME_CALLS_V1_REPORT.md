# SPIKE message.html — Realtime & Calls v1 audit/report

## Audit findings from the v35 project ZIP

- `message.html` was a minimal direct-message page using `private_messages`, a PostgreSQL Realtime INSERT subscription, and read-status updates.
- No direct-message typing indicator or direct-message voice/video WebRTC implementation was found in the inspected project JavaScript/HTML.
- `room_chat.html` has its own room typing UI/runtime; it is not a reusable direct-message call system.
- Existing call sounds are `assets/mp3/incoming.mp3` and `assets/mp3/outgoing.mp3`.
- Existing sound preferences are `user_app_settings.incoming_call_tone` and `user_app_settings.outgoing_call_tone`, exposed in `settings.html`.

## Changes in this patch

- Added `js/spike-dm-realtime-calls-v1.js` for direct-message typing broadcasts and WebRTC voice/video call signaling over an authenticated private Supabase Realtime channel.
- Added polished responsive SPIKE voice/video call UI in `message.html`: incoming accept/decline, outgoing call state, mute, camera toggle, end call, video preview, call timer, error feedback, and cleanup.
- Reused the existing incoming/outgoing ringtone files and settings; did not add replacement audio assets.
- Added `supabase/migrations/20261011140000_spike_dm_realtime_calls_v1.sql` to restrict private Realtime channel read/send access to the two user IDs in the channel topic.
- Added static regression checks at `js/audit/tests/dm-realtime-calls-v1.test.mjs`.

## Validation

- `npm run check`: passed; 426 tests passed, 1 optional Playwright accessibility test skipped, 0 failures.
- New focused checks: 4 passed.
- `js/spike-dm-realtime-calls-v1.js`: Node syntax check passed.
- Inline JavaScript in `message.html`: 2 scripts syntax-checked successfully.

## Deployment and runtime limitations

- The new SQL migration has **not** been applied to the live Supabase project by this patch. Apply the migration before testing private Realtime typing/call signaling; without it the private channel may fail authorization.
- Calls in this first pass are foreground-only: both users must have the same direct conversation open and connected to Realtime to receive/answer a call. This does not implement background/push call delivery.
- WebRTC uses public STUN servers only; some network/NAT combinations require a properly provisioned TURN service for reliable media connectivity. Do not hard-code TURN credentials into client code.
- Real-device microphone/camera, cross-account call, ringtone playback-policy, and live Supabase integration tests have not been performed in this environment.
- No live database migration or production deployment was performed.
