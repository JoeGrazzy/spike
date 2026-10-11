# SPIKE v44 — Incoming-call Realtime CHANNEL_ERROR

## Root cause
`js/spike-dm-realtime-calls-v2.js` subscribes to the private topic `spike:call:<recipient UUID>`. The existing Realtime authorization migration only grants access to topics matching `spike:dm:%`. Supabase therefore rejects the incoming-call channel, which logs `[SPIKE calls] Incoming-call channel failed: CHANNEL_ERROR`.

## Fix
Added `supabase/migrations/20261011170000_spike_call_channel_authorization_v1.sql`:
- SELECT: authenticated users can receive events only on their own `spike:call:<their UUID>` topic.
- INSERT: authenticated users can signal a recipient only if `public.private_messages` contains a message relationship between sender and recipient.
- Existing DM-topic policies are unchanged.

## Deployment and verification
This is a database authorization fix, so the migration must be applied to the Supabase project before the channel error can be considered resolved. Static checks and archive integrity are run for this package; live Supabase channel subscription and two-device call delivery are not claimed as verified.
