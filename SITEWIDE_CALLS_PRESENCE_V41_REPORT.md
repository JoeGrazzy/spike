# SPIKE v41 — Site-wide incoming calls and presence

## Root cause
- The v40 project loaded the call runtime only from `message.html`.
- That runtime subscribed to a single direct-message pair topic (`spike:dm:<uuid>:<uuid>`), so users on other pages had no incoming-call listener.
- Shared presence was included on only some pages and was manually started by page-specific runtimes. A profile page could also stop the viewer's presence based on the profile being viewed.

## Changes
- Added `js/spike-dm-realtime-calls-v2.js` and loaded it, plus `js/presence.js`, on all 21 HTML pages.
- Incoming call offers are delivered to a recipient-specific private Realtime topic (`spike:call:<recipient UUID>`), so a signed-in receiver can get an incoming call overlay on Feed, profile, Friends, Settings, Messages, and other pages without first opening `message.html`.
- Call signaling (offer, answer, ICE candidates, busy, decline, missed, hang-up) uses targeted user topics. Typing remains scoped to the open direct-message pair.
- Call UI is created dynamically on pages without the existing chat call overlay.
- Shared presence starts across pages and checks the signed-in user's own `profile_privacy.show_online_status` preference. Presence indicators are added dynamically to the inbox and DM thread and update from Realtime presence events.
- The old page-only call runtime is now a compatibility stub to avoid duplicate call listeners.
- Added migration `supabase/migrations/20261011170000_spike_sitewide_call_presence_v2.sql` for private targeted call-topic authorization.
- Updated reviewed protected-baseline hashes for the intentionally modified shared presence runtime and HTML pages; no baseline files were deleted.

## Verification
- `node --check` passed for all 36 JavaScript files in the archive.
- Focused call/presence regression tests: **6/6 passed**.
- Full project audit: **430 passed, 0 failed, 1 skipped** (the optional browser accessibility test is skipped when Playwright/browser dependencies are unavailable).
- Live Supabase Realtime/browser/device testing was not available in this build. The new migration must be applied to the target Supabase project before targeted call topics can work. Live call audio/video and actual presence delivery still require two-account device testing.

## Manual acceptance checks after deployment
1. Sign in as user A and open SPIKE Feed; sign in as user B on another device and call A from their DM.
2. Confirm A sees the incoming-call overlay while on Feed, profile, Friends, Settings, and Messages, without opening `message.html`.
3. Accept voice and video calls; confirm two-way audio, video, mute, camera toggle, and hang-up.
4. Open `messages.html` and `message.html`; confirm online/offline indicators update when the other account connects or disconnects.
5. Set `show_online_status` off in Settings and confirm that account no longer publishes global presence.
