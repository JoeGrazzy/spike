# SPIKE Calling Repair V12 — 24 November 2026

## Production evidence inspected
- Supabase Realtime logs during the user's two-device test showed repeated `Unauthorized` joins for private `spike-call:<call-id>` topics.
- The production `realtime.messages` policies are participant-scoped and require private Broadcast topics plus a live, unexpired call session. These policies were preserved; no RLS was weakened.
- Supabase Function logs showed `metered-turn-credentials` returning HTTP 502 because Metered's credential-create API returned HTTP 400. The previous function discarded Metered's response body, so the precise provider reason was hidden.

## V12 source changes
- Before every initial private signaling join or reconnect, the client now reconciles the call against the durable `spike_call_sessions` row. It stops retrying if the call is missing, expired, ended, or belongs to a different account.
- If the durable call row is already accepted, the caller resumes offer negotiation after the private channel subscribes.
- The voice-call badge now says `CONNECTING VOICE` until the actual WebRTC peer connection reaches `connected`; only then does it say `VOICE CONNECTED`.
- Updated the connection footer to accurately describe TURN relay with STUN fallback.
- Added regression tests for the durable call-session reconciliation and truthful connection badge.

## Supabase production change
- Deployed `metered-turn-credentials` Edge Function version 3 to project `veagqanfilmbchlvlpcc`; JWT verification remains enabled.
- The function accepts either a credential-scoped Metered API key or an account Secret Key in the server-side `METERED_API_KEY` secret.
- For credential-scoped keys it retrieves the ICE array directly. For account Secret Keys it first reuses a valid credential labeled `spike-rotating`, creating one only when needed. This avoids creating a new TURN credential on every cold start.
- Metered provider HTTP status and safe error message are now logged, without logging submitted keys or credential URLs.
- Metered's app domain remains `spikemediachat.metered.live`.

## Verification
- `npm test` — 56 passed, 0 failed; messaging page smoke test passed.
- `npm run check` — passed: 62 JavaScript files, 28 HTML pages and 64 CSS files.
- `node --check js/spike-call-engine.js` — passed.
- Supabase Edge Function version 3 — confirmed ACTIVE with JWT verification enabled.
- The V12 Cloudflare static-site archive has not been deployed from this environment. A fresh two-device call after deployment is still required to verify private channel joins, TURN relay candidate selection, and two-way media.
