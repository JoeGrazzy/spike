# SPIKE call channel authorization repair v48

## Confirmed live-project finding
The deployed Supabase project has legacy `spike:call` pair-topic policies and a recipient-channel SELECT policy that checks the recipient UUID against a private-message row as if it were the signed-in user. For the recipient subscribing to `spike:call:<their own UUID>`, that relationship predicate does not match normal messages. The runtime therefore receives `CHANNEL_ERROR` before WebRTC can start.

## Patch
Apply `supabase/migrations/20261011200000_spike_call_recipient_channel_authorization_repair_v3.sql` to project `cjqpyndceqyqsijihxbb`. It removes conflicting legacy call policies, lets an authenticated recipient read only their own recipient topic, allows an existing DM participant to read the other participant's call topic, and gates sending on a DM relationship. No public/anon access is added.

Then deploy the full project, clear the hosting/CDN cache, sign out and back in on both accounts, and test from two devices. Confirm the live `pg_policies` rows after migration. If CHANNEL_ERROR remains, inspect Supabase Realtime logs and confirm the browser uses this exact project URL and a valid signed-in JWT.

## Scope
This fixes the channel authorization blocker identified in the live policy inventory. It does not claim a real two-device call has been verified. After signaling subscribes successfully, WebRTC may still require TURN credentials for restrictive mobile networks.
