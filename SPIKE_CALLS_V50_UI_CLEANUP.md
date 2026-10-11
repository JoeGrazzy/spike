# SPIKE Calls v50 — single call UI

## Change
- Removed the legacy call modal markup and its duplicate CSS from `message.html`.
- The call runtime now creates and owns the single shared call UI, matching the preferred incoming-call layout more closely.
- Updated call runtime cache version to `sitewide-calls-v9` on `message.html` and `messages.html`.
- Kept the existing call DOM IDs, controls, signaling handlers, audio/video elements, and top-bar call buttons intact so this is a UI consolidation, not a call-system rewrite.

## Deploy
1. Upload the contents of this ZIP to the same website root, preserving paths.
2. Purge hosting/CDN cache, then reload `message.html` and `messages.html`.
3. Test incoming and outgoing voice calls, answer/decline, mute, hang-up, and video calls on two signed-in devices.

## Verification limits
This package can be checked for source consistency, but a real two-device browser test is still required to prove audio/video connectivity. The existing live Supabase call authorization repair remains a separate deployed database change.
