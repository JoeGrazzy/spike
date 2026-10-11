# SPIKE Sitewide Calls + Presence — v45

## What changed

- Replaced user-wide `spike:call:<recipient UUID>` signaling with private per-pair topics: `spike:call:<sorted UUID>:<sorted UUID>`.
- Both participants subscribe to the same pair topic. Incoming-call listeners are initialized from the signed-in user's existing direct-message relationships, so a recipient does not need to open `message.html`.
- Added participant-scoped Realtime SELECT/INSERT policies for pair topics. Policies require a valid pair of UUIDs, the authenticated user to be one of the pair, and a direct-message relationship between the two users.
- Kept call channel initialization errors isolated so a failed call-channel lookup does not prevent global presence from starting.
- Added the Supabase SDK and singleton loader to `guide.html`, `legal.html`, `help.html`, and `share.html`, which previously referenced the call/presence runtime without loading the SDK.
- Bumped sitewide runtime cache keys across pages to force clients to fetch the updated code.
- Added migration `20261011183000_spike_pair_call_channels_v1.sql` and follow-up policy validation migration `20261011184500_spike_pair_call_channels_uuid_validation_fix_v1.sql`.

## Verification

- `node --check js/spike-dm-realtime-calls-v2.js` passed.
- `node --check js/presence.js` passed.
- `npm run check`: 430 passed, 0 failed, 1 skipped. The skipped test is the optional browser accessibility audit because its browser dependencies are not installed.
- Live Supabase policy query confirmed both pair-channel SELECT and INSERT policies exist.

## Not yet verified

No live two-account browser/device call was run from this workspace. Microphone/camera permissions, ICE connectivity, deployed static assets, and actual presence events still need an end-to-end test in the deployed site. The package and DB policy are not a claim that a real call has been completed successfully.
