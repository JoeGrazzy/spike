# SPIKE Realtime Channel Separation — V9

## Inspected baseline
`SPIKE_COMPACT_CALL_END_TOAST_PATCHED.zip` was extracted and inspected before edits. The source archive passed ZIP integrity validation.

## Confirmed issues
- The call-session Postgres Changes feed was coupled to a private Realtime topic and a `realtime.messages` owner policy.
- The DM thread mixed private typing Broadcast with Postgres Changes on the same private topic.
- Production logs showed repeated private-topic authorization failures. Production table-level SELECT policies already restricted call sessions to participants and messages/conversation membership to conversation members.

## Changes
- Call-session Postgres Changes now use a separate public topic; participant-only RLS on `spike_call_sessions` remains the authorization boundary for delivered rows.
- DM Postgres Changes now use `spike-dm-db:<conversation-id>` and rely on existing table RLS.
- Typing uses a separate private `spike-dm-typing:<conversation-id>` Broadcast topic with conversation-membership-scoped SELECT and INSERT policies.
- Removed obsolete private call-event and old DM-topic policies. Private SDP/ICE signaling remains unchanged.
- Updated tests, project validation, and the calling recovery audit.

## Production Supabase
Migration `20261124044627_spike_realtime_postgres_changes_channel_separation_v1` was applied and recorded in project `Spikemediachat` (`veagqanfilmbchlvlpcc`). The two new typing policies were verified; obsolete topic policies were absent. The relevant four tables were confirmed in `supabase_realtime` publication.

## Tests
- `npm test`: 31 passed, 0 failed.
- `npm run check`: passed (62 JS, 28 HTML, 61 CSS).
- ZIP integrity: checked after packaging.

## Not claimed
The updated frontend has not been deployed to Cloudflare. A fresh two-account browser/device test is still required. STUN-only ICE can still fail on restrictive NAT/mobile networks without TURN.
