# SPIKE Direct Voice/Video Call — ZIP and Live Supabase Inspection

Inspection date: 18 November 2026
Supabase project: `SPIKE` (`cjqpyndceqyqsijihxbb`)

## Executive finding

The original `SPIKE_CALL_PERMISSION_ROUTING_FIXED.zip` still contains a direct-call signaling defect that matches the live Supabase authorization model: the caller attempts to subscribe to the recipient's private inbox topic. The live SELECT policy deliberately allows only the recipient to read that inbox. A caller therefore cannot subscribe there, so the outgoing offer/ICE/answer signaling path is blocked by Realtime authorization.

The original call UI also waits for microphone/camera setup before showing the outgoing interface, and its shared call overlay is not mounted until signed-in session initialization. On mobile, a slow or unresolved media-permission prompt can leave the caller seeing no call interface.

The repaired source in this package addresses these source-level issues. The live Supabase policies inspected match the repaired private-inbox design, so no database policy change was required for this repair.

## ZIP source comparison

Compared `SPIKE_CALL_PERMISSION_ROUTING_FIXED.zip` with the repaired source tree.

Confirmed original defects:

1. `getPeerChannel()` subscribed the caller to `spike:call:<recipient-uuid>` using the same subscription path as an incoming inbox. This conflicts with recipient-only SELECT authorization.
2. `startCall()` called `setupPeer()` (including `getUserMedia()` permission prompts) before rendering the outgoing call interface.
3. Shared call UI creation and binding were coupled to later authenticated-session activation.
4. DM call-button binding could be skipped when the recipient UUID was invalid, so the user received no clear feedback.

Repairs present in this package:

1. Outbound signaling creates a private channel object and calls `.send()` before subscribing. Supabase JS therefore uses its HTTP Broadcast send path; the caller does not join the recipient's private inbox. Incoming users subscribe only to their own inbox.
2. Outgoing UI is shown immediately with `Preparing call…`, before requesting microphone/camera permission.
3. Shared call UI is mounted and bound before Supabase client/session and Realtime initialization.
4. Voice/video buttons bind independently of recipient validation; validation is reported when the user starts a call.
5. The call script cache key is advanced to `sitewide-calls-v23` on the updated pages.

## Live Supabase findings

The live project currently has these Realtime policies on `realtime.messages`:

- `spike call recipient can receive own inbox` — SELECT; topic UUID must equal `auth.uid()`.
- `spike eligible dm participant can send call signals` — INSERT; sender must be a permitted DM participant, must not be the recipient, and must pass `can_message_spike_user()`.

This is the intended private recipient-inbox authorization model. It explains why the original caller-side subscription is denied and why the repaired HTTP Broadcast send path is appropriate.

The project also has `public.private_calls`, `public.private_call_signals`, and `public.private_call_participants`; RLS is enabled on all three. `private_calls` and `private_call_signals` are in `supabase_realtime`; `private_call_participants` is not. The current direct-message browser runtime uses private Realtime Broadcast topics for its call offer/answer/ICE signaling; these tables are not the active transport in that JS flow.

The active Edge Function list does not include a dedicated direct-call signaling function. That is not itself a defect in the repaired design: the client sends authorized Realtime Broadcast messages directly. The browser's WebRTC implementation still handles the actual audio/video media stream.

Migration-history note: live policy definitions match the v4 recipient-inbox policy design, but `supabase_migrations.schema_migrations` listed v2 and v3 and did not list v4 during this inspection. Because the live policies already exist, this repair does not blindly reapply or replace them. Reconcile migration history separately if v4 was applied outside the migration workflow.

## Validation performed

- `node --check js/spike-dm-realtime-calls-v2.js` — passed.
- `node --test tests/*.mjs` — 11 tests passed, 0 failed.
- `unzip -t SPIKE_CALL_INTERFACES_REPAIRED.zip` — archive integrity passed.
- Reviewed the deployed Supabase RLS policy definitions and relevant table publication/RLS state.

## Not yet verified

- No authenticated two-device live call was run. Therefore successful end-to-end audio/video, ringtone, incoming UI, answer, and ICE connectivity are not certified.
- This ZIP has not been deployed to the website host.
- No Supabase schema, RLS policy, Edge Function, or production setting was changed during this inspection.

## Deployment acceptance test

After uploading the website files, test with two different signed-in accounts/devices:

1. A starts a voice call to B: A must immediately see the outgoing interface; B must see the incoming interface.
2. B answers: both sides must see the active-call interface and hear two-way audio.
3. Repeat for video and confirm both remote and local video.
4. Test mute, camera on/off, camera flip where supported, end, decline, busy, missed-call timeout, and permission denial.
5. Inspect Realtime logs for successful Broadcast sends and recipient inbox subscriptions without caller SELECT authorization failures.

## Connectivity limitation

The current design intentionally uses Supabase for authenticated signaling and STUN-only WebRTC connectivity. Supabase Realtime does not carry the media stream. With no TURN relay, some carrier NATs, restrictive Wi-Fi networks, and firewalls will prevent direct media connectivity even when the UI and signaling work correctly. No external signaling service or TURN server was added.
