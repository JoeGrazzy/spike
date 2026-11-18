# SPIKE Calling V1 — Agora RTC

## Architecture
- The calling interface and Agora browser media client live in `js/spike-calling-v1.js`.
- The existing voice-note `MediaRecorder` remains separate and unchanged.
- Supabase stores call state in `public.spike_calls`; the deployed schema uses `recipient_id`.
- `spike-call-control` authenticates the user, calls the protected call lifecycle RPCs, and sends private Realtime inbox broadcasts.
- `spike-agora-token` issues a short-lived Agora RTC token only to a caller or recipient of an active call.
- Agora Web SDK 4.24.10 is loaded from Agora's official CDN.

## Supabase Edge Function secrets
Set `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` as Edge Function secrets. Never put the App Certificate or service-role key in browser code. The call-control function uses the standard server-side `SUPABASE_SERVICE_ROLE_KEY` only to publish private inbox broadcasts.

## Database compatibility
The live Spike database has `caller_id` and `recipient_id`; do not apply a migration that renames the recipient column to `callee_id`. The included migration adds call lifecycle fields and participant reservations while preserving existing rows and the deployed schema.

## Deployment order
1. Apply `supabase/migrations/20261118120000_spike_calling_v1_foundation.sql`.
2. Deploy `spike-call-control` and `spike-agora-token` with JWT verification enabled.
3. Publish the updated web app files.
4. Test voice and video calls between two signed-in devices over HTTPS.

## Validation status
Static source tests can validate the integration wiring. A successful deployment does not by itself prove microphone/camera permissions, two-device call delivery, token issuance, or media playback; those require a live two-device test.
