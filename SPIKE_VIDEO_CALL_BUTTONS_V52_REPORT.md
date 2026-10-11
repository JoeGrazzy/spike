# SPIKE v52 — video call control polish

## Changes
- Restyled call controls as touch-friendly, high-contrast rounded buttons with consistent spacing, subtle depth, focus-visible outlines, and pressed feedback.
- Made answer green and decline/end red; active microphone/camera controls use a distinct purple state.
- Improved small-screen sizing and safe-area spacing.
- For video calls, controls sit in a translucent blurred control tray over the video, while the local camera preview remains a compact picture-in-picture.
- Updated the call runtime cache query to `sitewide-calls-v11` on `message.html` and `messages.html` to avoid stale UI code.
- Kept existing control IDs and event handlers so this is a visual improvement, not a call-signaling rewrite.

## Validation
- `node --check js/spike-dm-realtime-calls-v2.js` passed.
- ZIP integrity checked after packaging.
- Real-device call behavior still requires testing after deployment.
