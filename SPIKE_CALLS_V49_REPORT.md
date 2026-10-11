# SPIKE voice/video calls — v49

## Live database repair
Applied migration `20261011130222_spike_call_recipient_channel_authorization_repair_v3` to Supabase project `cjqpyndceqyqsijihxbb`. A subsequent read-only policy query confirmed the two intended policies:
- `spike call recipient or dm participant can receive` — SELECT
- `spike dm participant can send recipient call` — INSERT

The old pair-call and mismatched recipient-call policies were dropped by the migration.

## Browser runtime updates
- Improved Realtime channel error details.
- Added optional configurable ICE server list via `window.SPIKE_CALL_ICE_SERVERS`; public STUN remains the fallback.
- Improved media permission error messages and remote media playback handling.
- Added ICE connection/disconnection diagnostics and recovery timeout.
- Cleans cached peer channels on auth changes.
- Bumped runtime cache query from `sitewide-calls-v7` to `sitewide-calls-v8` across page templates.

## Not yet proven
No end-to-end call between two real signed-in devices has been performed in this environment. TURN provider credentials must be configured for reliable connectivity across restrictive networks. Deploy the ZIP and run the checklist in `SPIKE_CALLS_V49_DEPLOYMENT.md`.
