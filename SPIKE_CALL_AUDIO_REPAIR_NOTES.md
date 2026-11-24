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
