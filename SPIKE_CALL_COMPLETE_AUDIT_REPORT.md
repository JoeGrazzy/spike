# SPIKE Calling System — Full Source and Live Supabase Audit

**Inspection date:** 18 November 2026  
**Source archive:** `SPIKE_CALL_SUPABASE_VERIFIED.zip`  
**Supabase project:** `cjqpyndceqyqsijihxbb`

## Executive result

The missing incoming/outgoing call interface problem is caused by multiple client-side integration defects, not by one missing Supabase table. The older call runtime had a caller-side private-inbox subscription that the intended RLS model rejected, rendered the outgoing UI only after microphone/camera permission completed, and coupled call UI creation to session/Realtime initialization. The newer call runtime repairs those defects. The full-page audit found another gap: six active SPIKE pages did not load the site-wide incoming-call receiver (and `help.html` did not initialize the shared Supabase client). Those pages have now been corrected in this package.

The current live database already has the recipient-only SELECT and eligible-sender INSERT policies required by the repaired private inbox flow. No production database migration or policy change was made in this repair.

## Root causes and evidence

1. **Caller subscribed to the callee's private inbox.** The original path attempted to join `spike:call:<recipient UUID>`, while the live SELECT policy only permits the UUID owner to read that inbox. Supabase Realtime logs show repeated `Unauthorized: You do not have permissions to read from this Channel topic` errors between 21:22 and 21:26 on 17 November.
2. **Outgoing UI appeared too late.** The previous `startCall()` waited for `setupPeer()` and `getUserMedia()` before calling `showCall()`. Android permission prompts could therefore leave the caller with no visible interface even though the call action had started.
3. **Call UI depended on session startup.** The previous shared overlay setup was coupled to authenticated-session activation and Realtime startup. The overlay now mounts and binds independently at runtime initialization.
4. **Invalid recipient could leave controls unbound.** The DM call buttons now bind independently of URL validation; the call action reports an invalid recipient instead of silently leaving a dead button.
5. **Global receiver coverage was incomplete.** The source archive did not load the call receiver on `admin.html`, `help.html`, `referrals.html`, `room.html`, `room-diagnostics.html`, and `wallet.html`. The receiver and required Supabase initialization have been added to those pages. Redirect-only wrappers (`following.html`, `legal.html`, `mutual-connections.html`, `mutuals.html`, `view_user.html`) intentionally redirect to pages that already load the receiver.

## Live Supabase verification

- Current `realtime.messages` policies:
  - `spike call recipient can receive own inbox` — authenticated SELECT limited to the recipient UUID in the topic.
  - `spike eligible dm participant can send call signals` — authenticated INSERT limited to valid recipient topics and `can_message_spike_user()`.
- `can_message_spike_user()` checks the caller identity, blocks, recipient messaging preferences, and friendship eligibility.
- The three legacy call tables (`private_calls`, `private_call_signals`, `private_call_participants`) all have RLS enabled. The current browser direct-call transport uses private Realtime Broadcast; these tables are not the active transport in this runtime.
- Realtime logs after 21:30 on 17 November contained no matching Unauthorized/permission-denied events. Later logs show successful Broadcast HTTP responses (`202`) and WebSocket upgrades (`101`). This confirms signaling requests reached Realtime; it does not prove that the remote browser rendered the incoming UI or that media connected.
- Migration history records v2 and v3 but not v4, while the live policies match the v4 policy design. This is a migration-history reconciliation item only; do not blindly reapply a migration just to make the history table match when the live policy definitions are already correct.
- Security advisors report broad project-wide SECURITY DEFINER warnings, including unrelated functions. They were not changed as part of this call repair.

## Changes in this package

- Added the shared call receiver to the six missing active pages.
- Added the Supabase singleton/platform bootstrap where those pages needed it, preserving deferred script ordering on the room diagnostics page.
- Added regression tests for complete active-page receiver coverage, Supabase bootstrap ordering, and required call-interface controls.
- Kept the existing direct Supabase Realtime signaling design and recipient-only private inbox authorization.
- Kept the existing STUN-only WebRTC policy. No TURN server, third-party signaling provider, SDP relay, new database migration, or production database mutation was introduced.

## Validation

- `node --test tests/*.mjs`: **15 passed, 0 failed**.
- `node --check` on every JavaScript file under `js/`: passed.
- Active-page receiver coverage: all 22 active HTML surfaces load the global call receiver. Redirect-only wrappers redirect to covered destinations.
- ZIP integrity: checked after packaging.

## What remains unverified

A true two-account/two-device browser test cannot be certified from static source checks and server logs alone. After deployment, test outgoing voice/video, incoming voice/video, answer, decline, end, mute, camera toggle, permission denial, timeout, reconnect, and both-way media with two signed-in accounts.

The package is a website-source update and has **not** been deployed to the live website host. Until these website files are uploaded/deployed, the production website can continue running the old broken interface.

## Important connectivity limitation

Supabase Realtime carries signaling, not the audio/video media stream. The current project intentionally uses direct STUN-only WebRTC connectivity. Some carrier NATs, restrictive Wi-Fi networks, or firewalls will prevent a direct media path. The UI and signaling can work correctly while media still fails on those networks. This package preserves the requested no-TURN/no-external-signaling architecture and fails gracefully rather than silently adding a relay.

## Deployment

Deploy the contents of this ZIP to the same website root used by SPIKE, preserving the `js/`, `css/`, `assets/`, and `supabase/` paths. Then hard-refresh or clear the site's cached files so the updated HTML and `sitewide-calls-v24` scripts are fetched. Do not apply a database migration for this package; the live call policies already match the required design.
