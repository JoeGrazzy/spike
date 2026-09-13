# SPIKE Share Engine

SPIKE uses `js/spike-share.js` as the central external-sharing layer.

## Behavior
- Shares Signal text and the exact Signal URL through the device Web Share API when available.
- Falls back to copying the exact Signal URL when device sharing is unavailable.
- Keeps the original SPIKE URL in the share payload.

## Integrated surfaces
- Feed Signals
- Feed Stories
- Feed profile actions
- Profile sharing
- Profile media viewer
- Profile QR sharing
- SPIKE Lifetime ID sharing
- View-user profile sharing
- Room sharing
- Room chat profile sharing
- Room chat sharing

## Post Share UX contract
- The Feed `↗ Share` action opens the Pass this Signal surface.
- `Connections` remains the native SPIKE-to-SPIKE path and preserves the user's optional voice note.
- `Outside SPIKE` launches the device Web Share sheet when supported.
- The visible raw localhost/share URL is removed from the modal; users get a clean copy-link action instead.
- Shared URLs resolve through `share.html` and preserve the exact `feed.html?post=<POST_ID>` destination.
- Native-share cancellation is not recorded as a completed share.
- If native sharing is unavailable, the UI falls back to copying the exact Signal link.
