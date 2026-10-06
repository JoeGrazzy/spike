# SPIKE Feed Echo keyboard visibility fix — 2026-10-06

## Root cause
The Feed's comment controller focuses the Echo textarea when the comments panel opens, but it does not re-position the textarea after Android's soft keyboard changes the visual viewport. The keyboard can therefore cover the active input until the user manually scrolls.

## Fix
- Added `js/spike-comment-keyboard-v1.js`, delegated to the active `.comment-form textarea`.
- On focus, it rechecks visibility through the Android keyboard animation and uses `scrollIntoView({ block: 'center' })` when the input is clipped.
- Listens to `visualViewport` resize/scroll changes and multi-line input growth.
- Respects reduced-motion preferences and stops repositioning after focus leaves the field.
- Loaded after the existing Feed runtime; existing comment submission/reply logic is unchanged.

## Scope and verification
- No Supabase migrations, RLS, RPCs, storage policies, or voice-note pipeline changes.
- Automated regression tests verify the helper is loaded in order and has the keyboard/viewport visibility contract.
- Real Android APK/WebView verification remains required to confirm the exact keyboard resize mode on-device.
