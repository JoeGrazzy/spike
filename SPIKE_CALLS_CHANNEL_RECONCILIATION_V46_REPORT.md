# SPIKE v46 — Call channel authorization reconciliation

## Root cause addressed
The shipped call runtime uses recipient topics (`spike:call:<recipient UUID>`), while the migration history also contains a later pair-topic experiment (`spike:call:<sorted UUID>:<sorted UUID>`). That mismatch makes call-channel authorization dependent on which migrations have actually been applied. The recipient-topic runtime is retained and the new migration removes the competing pair-topic policies before recreating the matching recipient SELECT/INSERT policies.

## Changes
- Added `supabase/migrations/20261011193000_spike_call_channel_authorization_reconcile_v1.sql`.
- Bumped sitewide call-runtime cache keys from `sitewide-calls-v5` to `sitewide-calls-v6`.
- The recipient can subscribe only to their own incoming-call topic; sending a signal requires a direct-message relationship in `public.private_messages`.

## Deployment required
Apply the new migration to the same Supabase project configured in `js/spike-dm-realtime-calls-v2.js`, then deploy the updated static files and hard-refresh both caller and recipient clients. A local code patch cannot apply a remote database migration automatically.

## Verification limits
Static tests and JavaScript syntax checks can verify the package only. A real two-account test is still required to confirm live Realtime authorization, device permissions, and media connectivity. The current peer connection uses public STUN servers only; some mobile/carrier/NAT networks require a configured TURN relay for reliable audio/video.
