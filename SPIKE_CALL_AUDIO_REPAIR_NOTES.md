# SPIKE Call Audio Repair — 24 November 2026

## Confirmed source-level weaknesses

- Video calls used the remote `<video>` element as the only audible output. Mobile browsers may block audible autoplay for media elements, and the old code swallowed `play()` failures.
- Voice calls also swallowed remote audio `play()` failures and offered no user-gesture recovery.
- The UI did not expose whether the browser had blocked audio output.

## Repair

- Added a dedicated, unmuted remote `<audio>` sink for both voice and video calls.
- Muted the remote video element so audio is not played twice.
- Prime browser audio output synchronously from the Start Call and Accept Call user gestures using AudioContext where supported.
- Detect rejected audio playback, show a clear status message, and expose an Enable sound control that retries playback from a user gesture.
- Preserve existing microphone capture, WebRTC signaling, Supabase call-session logic, and call permissions. No Supabase schema or RLS changes were made for this audio repair.

## Verification

- `node --check js/spike-call-engine.js` — passed.
- `npm test` — 53 tests passed, 0 failed; messaging smoke test passed.
- `npm run check` — passed: 62 JavaScript files, 28 HTML pages and 64 CSS files; local references, Worker configuration and migration inventory validation passed. The validator distinguishes the deployed Android device-lock migration version `20261124110714` from the reviewed local friend-request notification constraint migration `20261124110000`.
- Live two-device microphone/speaker playback and Cloudflare deployment have not been performed from this build environment. The repair is source-tested, not device-certified.

## Remaining network limitation

The current WebRTC ICE configuration remains STUN-only. Audio playback repair does not add TURN relay support, so some restrictive mobile networks may still fail to establish media paths.


## V10 private signalling authentication correction — 24 November 2026

### Production investigation

- Re-read the production Realtime authorization failures for both participants and inspected the current `realtime.messages` policies, call-session RLS, helper grants, and failed call rows.
- Simulated the active-call participant predicate under the `authenticated` database role using a temporary call row inside a rolled-back transaction. The callee satisfied the existing participant predicate. This did not reproduce a SQL membership-policy denial; no production policy was weakened or changed.
- Confirmed the live private signaling policy still requires a private Broadcast topic and an active, unexpired call session belonging to the authenticated caller or callee.

### V10 source correction

- Added an explicit Realtime-auth synchronization step immediately before private call-channel creation and every reconnect.
- Refreshes an expiring access token and calls `realtime.setAuth()` before joining, while refusing to continue if the current session belongs to a different SPIKE account than the active call participant.
- Added a single-flight guard so concurrent reconnect attempts cannot create duplicate private call channels.
- Applies the same token synchronization before creating or accepting a call session.
- Removed a duplicate remote-audio `play()` invocation from the Enable sound action.
- Preserved private call topics, participant-scoped RLS, and STUN-only ICE. No TURN service, credential endpoint, or production database policy change was introduced.

### V10 verification

- `node --check js/spike-call-engine.js` — passed.
- `npm test` — 54 tests passed, 0 failed; messaging pages smoke test passed.
- `npm run check` — passed: 62 JavaScript files, 28 HTML pages and 64 CSS files.
- ZIP integrity verification performed after packaging.

### Remaining acceptance boundary

- The Cloudflare production site has not been deployed from this environment, and the live browser could not be fetched for direct version verification.
- The production Realtime authorization errors were historical logs from the user's previous test; a fresh post-deploy two-account test is required to prove that the deployed version joins successfully.
- Microphone/speaker routing and camera permission still require physical Android/browser verification. Automated source tests cannot certify live media transport.
