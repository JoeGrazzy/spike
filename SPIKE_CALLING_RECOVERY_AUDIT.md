# SPIKE Calling Recovery — V4 Audit Notes

## Confirmed V3 defect

The outgoing call flow rendered its interface only after awaiting `getCurrentUser()`. That Auth request was outside the call-start `try` block. If session restoration was slow or failed, the user saw no outgoing interface at all, despite the button handler being present and correctly wired. The prior audit incorrectly described the problem as missing button handlers; V3 does contain the handlers in `js/spike-call-engine.js`.

## V4 correction

- Set the outgoing call state and render the cancellable outgoing UI synchronously before asynchronous Auth restoration.
- Move `getCurrentUser()` inside the guarded call-start path so errors are cleaned up consistently.
- Start the peer-profile lookup only after auth is resolved; profile lookup failure no longer blocks call setup.
- Added a regression test asserting that outgoing UI rendering precedes Auth restoration.

## Verification

- `node --check js/spike-call-engine.js` — passed.
- `node --check js/spike-messaging.js` — passed.
- `npm test` — 24 tests passed.
- `npm run check` — passed: 62 JavaScript files, 28 HTML pages, 66 CSS files; project validation passed.
- ZIP integrity verification — performed after packaging.

## Still not production-certified

The archive cannot prove live Supabase Realtime delivery, database RPC/RLS compatibility, two-device behavior, mobile browser permissions, or Cloudflare deployment. This V4 change specifically removes the confirmed UI-blocking Auth wait; it does not claim that every call lifecycle or network path is now production-perfect. The current ICE configuration is STUN-only, so restrictive NAT/mobile networks may still require TURN for reliable media connectivity.

## V5 inspection and correction

### Confirmed code-level race found during the V4 re-inspection

- `message.html` rendered both call buttons enabled immediately, before `spike-messaging.js` completed `setupThread()`.
- `setupThread()` resolves the conversation membership and recipient asynchronously. Until that work completes, `SPIKE_MESSAGING.getCallContext()` can return a conversation ID with no peer ID (or no usable call context).
- `startCall()` correctly rejects an invalid/missing peer context before rendering the outgoing UI. Therefore an early tap during messaging bootstrap can fail without showing the outgoing interface. The UI-before-auth fix in V4 did not cover this earlier context-readiness gate.

### V5 correction

- Voice and video call buttons now start disabled in the HTML.
- Messaging keeps them disabled while the direct conversation recipient and messaging permission are being resolved.
- Buttons are enabled only when the conversation is one-to-one and `can_message_spike_user` explicitly returns true.
- Group chats and conversations without exactly one peer cannot enable one-to-one calling.
- Added a regression test for this bootstrap/permission gate.

### V5 verification

- `node --check js/spike-messaging.js` — passed.
- `node --check js/spike-call-engine.js` — passed.
- `npm test` — 25 tests passed.
- `npm run check` — passed: 62 JavaScript files, 28 HTML pages, 66 CSS files; local references, Worker configuration and migration baseline checks passed.
- Live Supabase migration state, live Realtime delivery, device permissions, two-device media negotiation and deployed Cloudflare behavior remain unverified from this archive-only environment.


## V6 production-log correction

### Confirmed production evidence

The connected production Supabase Realtime logs contained repeated `Unauthorized: You do not have permissions to read from this Channel topic: spike-call-events-<user-id>` errors while the call-session REST polling requests returned HTTP 200. The database's `spike_call_sessions` table has participant-only SELECT RLS, and the private SDP/ICE call channel has separate participant authorization.

### V6 correction

- Changed only the per-user call-event listener (which consumes `postgres_changes` and no Broadcast/Presence events) to use a public Realtime topic. Supabase documents that Postgres Changes can use public or private channels and that table RLS controls which rows are delivered.
- Kept `spike_call_sessions` participant-only SELECT RLS unchanged.
- Kept the SDP/ICE signaling channel private and participant-authorized.
- Added a regression test to prevent accidentally reintroducing private-topic authorization on the Postgres Changes-only listener.

### Verification boundary

Automated tests and project validation are run on V6. Production code has not been deployed by this archive edit; after deployment, verify a fresh Realtime join and two-account incoming-call delivery in live logs. This does not certify media connectivity on restrictive NATs; this build still uses STUN-only ICE configuration.

## V7 deep signalling-race correction

### Confirmed code-level race found during V6 inspection

- The callee can receive the caller's SDP offer and ICE candidates while `getUserMedia()` is still pending, or while the callee's accept RPC is still returning.
- The previous `handleSignal()` path attempted to use `state.pc` immediately. On the callee, the peer connection is created only after media permission resolves, so early offer/ICE messages could be discarded and were not replayed by Realtime.
- This could leave both call interfaces visible while negotiation stalled.

### V7 correction

- Added a per-call inbound signalling queue for early offers, answers and ICE candidates.
- Added ordered queue draining after peer-connection creation and after the callee enters the joining/negotiating states.
- Preserved ICE ordering so candidates received after the offer are not stranded when handling the offer changes the call state to negotiating.
- Clear inbound signalling queue state during call cleanup.
- Added a regression test for the early-message race.

### V7 verification boundary

- `node --check js/spike-call-engine.js` — passed.
- `npm test` — 26 tests passed.
- `npm run check` — passed: 62 JavaScript files, 28 HTML pages, 66 CSS files; local references, Worker config and known production migration baseline checks passed.
- ZIP integrity verification performed after packaging.
- This is a code-level correction, not a live two-device certification. Cloudflare deployment and live microphone/camera/WebRTC testing have not been performed.


## V8 production authorization alignment

### Confirmed V7-to-production mismatch

- The connected production `realtime.messages` policies for `spike-call-events-<user-id>` explicitly require `private IS TRUE` and require the topic to match the authenticated user's own ID.
- V7's `subscribeEvents()` created that same topic without `{config:{private:true}}`, so the client joined it as public while production required private. This is the direct cause of the logged `Unauthorized` joins for call-event topics.
- Production inspection confirmed the policies were installed, `spike_call_sessions` has participant-only SELECT RLS, and the table is in `supabase_realtime` publication.

### V8 correction

- Configure the per-user Postgres Changes channel as private, matching the already-installed production topic policy.
- Preserve participant-only SELECT RLS on `spike_call_sessions`; do not weaken the policy or make call topics public.
- Replace the prior regression test that incorrectly required a public topic with a test that enforces private channel configuration and the deployed authorization policy.
- Update project validation to reject a public event channel when the deployed policy requires private.

### Verification boundary

- Re-run all local regression tests, JavaScript syntax checks, project validation and ZIP integrity after packaging.
- The production database was inspected read-only. No production schema, policy, data, or deployment was changed by this V8 package edit.
- A fresh production client join and two-account incoming-call test are still required after deploying V8. Historical authorization errors are not evidence of a post-V8 result because V8 has not been deployed.
