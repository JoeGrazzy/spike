# SPIKE Presence V2 — Rebuild & Verification Report

**Source:** `SPIKE_DM_ATTACHMENT_VIEWER_V2.zip`  
**Output:** `SPIKE_PRESENCE_V2_REBUILT.zip` (updated with top-positioned online notice)  
**Supabase project:** `SPIKE` (`cjqpyndceqyqsijihxbb`)  
**Scope:** One authoritative site-wide presence engine, persistent last-seen timestamps, smart online-arrival notices, and Room Chat integration.

## Delivered

### 1. One authoritative Presence V2 runtime

- Rebuilt `js/presence.js` as the only presence publisher/listener, on the existing private `spike-global-presence` topic.
- Centralized authentication, own-profile privacy checks, subscription/reconnect lifecycle, 30-second Realtime heartbeat, persistent heartbeat, last-seen lookup, DOM status updates, watched-user state, and event subscriptions.
- Added idempotent startup and shared API: `start`, `stop`, `heartbeat`, `watch`, `subscribe`, `isOnline`, `getState`, `isPublishing`, `setContext`, and room-online count helpers.
- Realtime Presence is authoritative for immediate online state. A per-page known-online set is seeded from initial synchronization and tracks actual offline-to-online transitions, preventing refresh/reconnect sync and additional same-user tabs from producing false arrival notices. The authenticated database RPC provides persistent server-confirmed last-seen timestamps and the existing 90-second stale/offline fallback.
- Graceful stop attempts a final authenticated timestamp update. Unexpected browser/process/network loss can only be timestamped to the last successful server heartbeat; it cannot reveal an exact physical disconnect instant.
- Explicit sign-out paths now forcefully stop the shared session, while profile-view privacy decisions cannot accidentally shut down the signed-in user's own global presence.

### 2. Smart new-online notification

- Shows a compact, theme-token-aware notice at the **top center**, below the device safe-area inset, with the member's real profile picture and name (initial fallback if no avatar/profile is available).
- Displays for any opted-in member who genuinely joins the global presence channel, regardless of which page the visitor is viewing or whether that member appears in a page-specific friend/inbox watch list. Initial `sync` reconciliation does not trigger notifications.
- Uses a short 1.5-second initial-settle guard, a 2.5-second visible duration, top safe-area positioning, reduced-motion support, and a 60-second per-user deduplication window. Avatar-load failures are guarded so a late failure from an old notification cannot overwrite the next member's picture.
- Does not notify about the current user or while the page is hidden.

### 2a. Top-positioned online notice refinement

- Moved the existing single notification container from bottom anchoring to top-center placement, offset by `env(safe-area-inset-top)` so it clears Android/iOS status bars and camera cutouts.
- Kept the same renderer, event pipeline, single DOM container, profile lookup, avatar/name content, theme tokens, timeout, and deduplication. No second toast or presence listener was introduced.
- Hardened avatar fallback against stale image-error callbacks so an earlier member's failed image cannot overwrite the next member's avatar.
- Bumped the shared Presence V2 script cache key on all 24 consuming pages so clients fetch the updated CSS-in-JS runtime.

### 3. Site-wide integration and duplicate removal

- All 24 production HTML pages load the same cache-busted `js/presence.js?v=presence-v2` runtime and the shared `js/supabase-singleton.js` bootstrap. The Presence runtime automatically attaches to the one shared Supabase client and starts for an existing authenticated session; it also starts after a later sign-in and stops after sign-out.
- `messages.html` uses the central watch/status API; the independent `js/presence-timestamps.js` runtime and its extra script include are deleted.
- `friends.html` no longer contains the fallback `spike-app-presence` channel or a competing `AppPresence` implementation.
- The DM call bootstrap delegates privacy and startup to Presence V2; its duplicate privacy lookup and inbox MutationObserver/watch loop were removed.
- Removed the Feed runtime’s second 30-second heartbeat timer (`SPIKEPresencePatch`); Feed now relies on the central engine’s own heartbeat.
- `room_chat.html` no longer creates `room-presence-*`. Room occupancy metadata is published through the global presence channel; member status rows use the central API. The existing room-chat Realtime channel still carries read-receipt broadcasts.
- Legacy timestamp-only implementation report was marked historical/superseded. Existing SQL migrations remain intact as database history.

### 4. Live Supabase verification (read-only)

Verified against the connected SPIKE project:

- `public.user_presence` exists and has RLS enabled.
- Direct table policies: **0**; direct table privileges remain revoked.
- `touch_user_presence(uuid,text)` and `spike_get_user_presence(uuid[])` both exist.
- `authenticated` can execute both RPCs; `anon` cannot.
- The touch RPC checks the supplied user ID against `auth.uid()` before writing.
- The lookup RPC requires an authenticated caller, caps lookups at 100 IDs, applies the 90-second last-seen threshold, and excludes profiles with `show_online_status = false`.
- Authenticated-only receive and publish policies already exist for the exact `spike-global-presence` topic.
- Profile columns used by the popup (`id`, `display_name`, `username`, `avatar_url`, `full_name`) exist.

**No SQL migration was applied and no live database schema, rows, policies, or migration history were changed.** The current live database already has the required table, RPCs, grants, and Realtime policies.

### 5. Verification

- `node --check` passed for the Presence V2 runtime and edited JavaScript runtimes.
- All inline HTML JavaScript blocks passed the project-integrity syntax test.
- Focused Presence V2, Friends, Inbox, Room Chat, call-bootstrap, sign-out, and global page-bootstrap checks: **18 passed, 0 failed** (including global-notice, automatic-auth-attach, all-24-pages, and policy-page session regressions).
- Full project audit after the global-bootstrap correction: **647 tests discovered; 637 passed, 9 failed, 1 skipped**. The nine remaining failures are outside this Presence V2 scope: global theme authority/palette contracts, onboarding stylesheet placement, and the Notifications unread-badge contract. No Presence V2 focused test failed. The optional browser accessibility test remains skipped because its browser dependencies are unavailable.

## Not yet verified on real devices

The archive has not been deployed. Two-account live-device checks are still required for Android backgrounding, browser force-close, network loss/reconnect, simultaneous tabs, privacy toggles, popup appearance/deduplication, and room occupancy. Those behaviors cannot be honestly certified by static ZIP tests alone.


## Follow-up correction: profile identity and compact popup (2026-11-12)

The Android screenshot showed the fallback identity (“A SPIKE member” and initial-only avatar). The prior popup attempted a direct `profiles` table read and silently treated an inaccessible row as missing. This is inconsistent with the app's established public identity access path.

Corrections in this follow-up:
- Presence notification identity now resolves through the existing authorized `get_public_profiles(p_user_ids)` RPC first, with the existing `get_registered_users_public` directory RPC as a fallback. No new RPC, migration, table, or policy was added.
- Avatar URL resolution now uses the shared `SPIKE_IDENTITY.imageOf` helper and its image fallback/initials behavior.
- Added a sequence guard so a late profile lookup cannot overwrite a newer arrival notification.
- Reduced the notification maximum width and force-scoped the dismiss control to a 28px circular button, overriding generic global button dimensions.
- Updated the Presence V2 cache key on all 24 pages that load it.

Validation: all JS/MJS files pass `node --check`; focused Presence tests pass; full suite reports 634 passed, 9 failed, 1 skipped. The same nine unrelated pre-existing theme/onboarding/Notifications unread-badge contract failures remain. Live two-account verification is still required to confirm the deployed public-profile RPC returns the target member's permitted profile and avatar.


## Follow-up correction: true site-wide arrival delivery (2026-11-12)

The cross-page audit found that the original renderer only announced users already added to a page-specific `watch()` list. That did not meet the global-notification requirement.

Corrections in this follow-up:
- Global arrival notices now listen for genuine new user keys on the one `spike-global-presence` channel, independent of the page's watched list.
- A known-online baseline is captured after initial Realtime synchronization. Only a later offline-to-online key transition can announce; initial sync, refresh, reconnect reconciliation, and extra tabs for an already-online user do not create duplicate arrival notices.
- `AppPresence.attach(client)` now owns one auth-state listener per shared Supabase client, starts presence for an existing authenticated session, starts after sign-in, and stops after sign-out.
- The shared Supabase singleton attaches Presence V2 whenever the canonical client is created, and Presence V2 attaches to a client that already exists when the runtime loads.
- All 24 production HTML pages were checked for both shared runtime and singleton integration. The Policy page now uses the shared persistent authenticated session instead of constructing an isolated non-persistent client, allowing presence to work there without a second client. All 24 HTML script URLs use a fresh global Presence cache key so browsers fetch this correction.
- Added regression coverage for global joins, singleton attachment, all 24 pages, and the Policy session path.

Validation: all 18 focused Presence integration/lifecycle tests passed. Full project audit: 647 discovered, 637 passed, 9 failed, 1 skipped. The nine failures remain the pre-existing theme authority/palette, onboarding placement, and Notifications unread-badge contracts. No Supabase migration or live database change was required.
