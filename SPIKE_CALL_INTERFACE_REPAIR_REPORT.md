# SPIKE Calling Interface Repair — 17 November 2026

## Scope
Reviewed the uploaded `SPIKE_CALL_PERMISSION_ROUTING_FIXED.zip` package and repaired the shared direct-message call runtime. The Supabase Realtime signaling design and direct-only STUN connectivity policy were preserved. No TURN server, external signaling service, SDP relay, or new database migration was introduced.

## Confirmed source-level defects

1. **Outgoing interface rendered too late.** `startCall()` awaited `setupPeer()` (including `getUserMedia()` permission prompts) before calling `showCall()`. On mobile, a delayed or unresolved microphone/camera permission prompt therefore left the caller looking at a blank page even though the call action had started.
2. **Call UI creation depended on session activation.** The shared overlay was mounted only from `activateSession()`, coupling the UI bootstrap to authentication and Realtime initialization rather than making the renderer available independently.
3. **Direct-message buttons could remain unbound.** `connectDM()` returned immediately for an invalid/missing recipient UUID before binding the voice/video buttons. That made a malformed conversation URL look like a dead call control instead of reporting a recipient validation error.

## Changes made

- Mount and bind the shared call overlay as soon as the call runtime initializes, before resolving the Supabase client/session.
- Render the outgoing call interface immediately with a clear **Preparing call…** state before requesting microphone/camera access.
- Keep ringtone playback, outgoing offer signaling, and the ringing timeout behind successful media permission and peer setup. A permission failure shows the call error UI and does not send a phantom call.
- Bind voice/video buttons regardless of URL recipient validity; keep recipient validation inside the call action.
- Preserve the existing incoming-call rendering path: an incoming offer is displayed immediately by `receiveOffer()` before profile lookup.
- Preserve private Supabase Realtime recipient inbox signaling, current RLS policy assumptions, existing call controls, and the direct STUN-only/no-relay policy.

## Validation performed

- JavaScript syntax check: `node --check js/spike-dm-realtime-calls-v2.js` — passed.
- Updated regression tests assert that the caller overlay appears before media permission resolves, while ringing/signaling remain after permission succeeds.
- Added regression assertions for early overlay bootstrap and call-button binding with invalid recipient parameters.
- Archive structure and ZIP integrity checked after packaging.

## Deployment and remaining acceptance test

The ZIP contains updated website source files. It has **not** been deployed to the live website host by this repair. Upload/deploy the package's website files before testing.

A real two-account browser/device test could not be executed in this environment. After deployment, verify: outgoing voice, outgoing video, incoming voice, incoming video, permission denial, accept, decline, end, and Realtime reconnect using two signed-in accounts. Supabase Realtime transports signaling only; it does not carry the media stream. With the preserved STUN-only policy, direct media connectivity is not guaranteed on every mobile carrier/NAT/firewall.
