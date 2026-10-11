# SPIKE v47 — call signaling trace and fixes

## Findings from the source archive

1. The call runtime uses private Supabase Realtime topics `spike:call:<recipient UUID>`.
2. Channel subscription failures were swallowed after a single attempt; the UI could continue without an incoming-call listener.
3. The runtime did not explicitly refresh/set the Realtime access token immediately before subscribing, and did not reliably rebuild the incoming-call channel after sign-in/session refresh.
4. Voice/video media is WebRTC; it cannot work until signaling subscriptions and database authorization succeed. STUN-only ICE configuration may also fail on restrictive mobile/carrier NATs; production should configure TURN.
5. This source-only check cannot verify live Supabase project policies, authentication, domain configuration, microphone permissions, or real two-device network connectivity.

## Changes in v47

- Refresh and validate the signed-in session before private channel subscriptions.
- Explicitly pass the current access token to Supabase Realtime when supported.
- Retry incoming/outgoing channel subscriptions up to three times and remove failed channels.
- Recreate the recipient listener when the auth session changes; remove the previous listener first.
- Improve logs to distinguish missing/expired sessions, timeout, and authorization/channel failures.
- Cache-bust site-wide runtime references to v6.

## Required deployment steps

1. Deploy this entire ZIP to the same hosting origin used by SPIKE.
2. In the correct Supabase project (`cjqpyndceqyqsijihxbb`), run `supabase/migrations/20261011193000_spike_call_channel_authorization_reconcile_v1.sql` if it has not already been applied. Do not run it against a different project.
3. Verify the SQL migration succeeded. Then inspect `realtime.messages` policies with the diagnostic SQL in `SPIKE_CALLS_V47_DIAGNOSTICS.sql`.
4. Sign out and back in on both devices, then reload `message.html?to=<other-user-uuid>` on both devices.
5. Check browser console and Supabase Realtime logs. If the channel still returns `CHANNEL_ERROR`, the server-side authorization/policy or project configuration remains the blocker; JavaScript cannot override it.
6. For cross-network reliability, configure a TURN server and add its credentials to the `RTCPeerConnection` `iceServers` list.

## Verification

JavaScript syntax checks are run against the patched call runtime. Live Realtime subscriptions and two-device voice/video calls are not claimed as tested from this offline source archive.
