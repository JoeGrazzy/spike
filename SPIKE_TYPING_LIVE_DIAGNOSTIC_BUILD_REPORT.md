# SPIKE Typing Live Diagnostic Build

## Purpose
This build adds a small on-screen diagnostic panel to the existing direct-message and room-chat typing paths. It does not claim to prove a live fix. It is intended to identify the first failing stage on the actual Cloudflare/Supabase deployment.

## Visible events
- Composer input detected
- Broadcast blocked (with safe reason)
- Channel subscribed / unavailable
- Broadcast attempted / result / error
- Typing event received / ignored

The panel avoids logging access tokens, message contents, user IDs, or full channel topics. Tap **Hide** to dismiss it. Browser console entries use `[SPIKE typing diagnostic]`.

## Files changed
- `js/spike-dm-realtime-calls-v2.js`: added diagnostic output for composer input, readiness gates, broadcast results, subscription status, and received events.
- `room_chat.html`: added equivalent room typing diagnostics.
- `message.html`, `room_chat.html`: cache-busted shared script URL from `sitewide-calls-v15` to `sitewide-calls-v16`.

## Important
This is a diagnostic build, not proof of a production fix. It must be deployed to the same Cloudflare environment used by the two accounts. Direct-message private-channel authorization still requires the Supabase migration `20261012150000_spike_dm_typing_realtime_authorization_v1.sql` to be applied if it has not already been. Do not expose a public fallback for private DM typing.

## Test
1. Deploy these files.
2. Fully reload both split-screen pages.
3. Type in account A's open DM; read the panel on both sides.
4. Repeat in reverse, then repeat inside the same room.
5. Report the last event each screen shows. That identifies the first failing stage.
