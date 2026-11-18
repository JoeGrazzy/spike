# SPIKE — backend and ownership handoff status

This archive is a **frontend plus partial Supabase integration handoff**, not a complete production certification. It contains SPIKE static HTML, CSS, JavaScript, assets, automated source tests, browser-safe Supabase integration, and four local SQL migration files. The connected Supabase project has 20 recorded migrations; most historical migration SQL bodies are not bundled locally. Phase 11 publishes the affordable launch catalogue; see `docs/PHASE11_AFFORDABLE_CATALOGUE.md` for the current live catalogue and verification.

## Deliberately not included
- No service-role key, Edge Functions, or account data are included. A browser-safe Supabase publishable key and project URL are configured in the source. The live project has 20 recorded migrations; four migration SQL files are included in this archive, so the local migration history remains incomplete.
- No Agora or LiveKit SDK/configuration, credentials, or calling backend.
- No production backend, authentication provider, realtime service, storage service, or push-notification service.
- No previous Cloudflare worker hostname or previous support phone/email.

## Runtime status
The frontend is not independently functional for account sign-in, synchronized messaging, realtime presence, uploads, notifications, feed persistence, wallet transactions, room operations, or other server-backed features. Those require a newly owned backend and a deliberate integration pass. UI elements for these capabilities may remain visible but must not be represented as production-ready until wired and tested.

## New-owner configuration
1. Create new organization-owned source control, hosting, domain/DNS, backend, storage, email, OAuth, analytics, and monitoring accounts as required.
2. Configure the new official support email and WhatsApp number in `help.html`.
3. Replace the `YOUR-DOMAIN.example` Open Graph URL in `share.html` with the final public share URL.
4. Review `wrangler.jsonc` and set the intended deployment project/account using the new owner's Cloudflare account. Do not copy old account credentials.
5. Design and implement a replacement backend. Define database schema, authorization/RLS, storage policies, realtime, server functions, rate limits, backups, and audit logging before launch.
6. Reconnect each server-backed frontend feature to that backend. Never place service-role keys, provider secrets, or privileged tokens in browser code.
7. Configure OAuth redirect URLs, email templates, domain allowlists, app identifiers, push credentials, and webhook endpoints under the new owner's accounts.
8. Run functional, security, accessibility, mobile, and regression tests against the new environment.

## Ownership and legal checks
- Transfer/confirm rights to the SPIKE name, logo, icon, fonts, illustrations, and all third-party assets. This ZIP alone does not prove intellectual-property ownership or transfer licenses.
- Review privacy policy, terms, retention/deletion, age/safety controls, payment/wallet obligations, and data-protection notices for the new operator and jurisdiction.
- Rotate or revoke any credentials that may have been exposed outside this archive. This archive operation cannot revoke credentials in remote services.
- Transfer DNS, app-store listings, signing keys, package identifiers, social accounts, support channels, billing, and vendor subscriptions separately. None of those remote assets are transferred by a ZIP file.

## What was changed for this handoff
- Removed the previous operator's WhatsApp number and support email from the Help Centre, replacing them with explicit setup reminders.
- Replaced the previous Cloudflare Workers share URL with a clearly marked domain placeholder.
- Renamed the generic Wrangler worker target to `spike-frontend`; it contains no account ID or token.
- Preserved the frontend assets and the existing test file.

## Important boundary
This package is prepared for a **new-owner setup**, not certified as production-ready. No remote Supabase, Cloudflare, OAuth, email, app-store, or other service was accessed, changed, deleted, or transferred during this archive preparation.

## Frontend source normalization (2026-11-18)
- Internal CSS and JavaScript asset names were normalized to semantic names without numbered patch suffixes.
- Feed runtime fragments were consolidated into `js/feed-runtime.js`; the feed loader remains at its original load point as `js/spike-feed-loader.js`.
- Duplicate local stylesheet/script references and missing local CSS/JS references were checked across all HTML pages.
- Duplicate literal HTML element IDs were checked outside script source blocks.
- Added `npm run check` and regression tests for canonical asset names, local references, duplicate references/IDs, JavaScript syntax, and the retired calling stack.
- These checks validate source integrity; they do not replace browser/device QA or backend integration testing.


## Feed media publisher service

`js/spike-post-publisher.js` is loaded on `feed.html` and provides `window.SPIKE_POSTS.publishPost()` plus `createMediaUrls()`. It writes to the existing `posts` and `post_media` tables and the private `post-media` bucket, using the ownership path expected by Storage RLS. Per-file upload size is currently capped at 6 MB pending resumable/TUS upload support. The Feed composer remains disabled by the existing feature-removal guard, so the publisher service is not yet a complete user-facing publishing flow.

## Supabase integration progress (2026-11-18)
The current working build is connected to the SPIKE Supabase project through the browser-safe publishable key in `js/spike-platform-bootstrap.js`. The project has live profiles, social, feed, messaging, rooms, notification, and wallet tables; the messaging and media flows below use the existing schema and RLS rather than embedding privileged credentials.

### Direct messaging integration added
- Added `js/spike-messaging.js` to the inbox and conversation pages.
- Inbox now reads the signed-in user's conversation memberships, loads conversation previews and peer profiles, supports search and unread filtering, and refreshes when a new message arrives.
- A member can start a direct conversation from a social connection row; the controller reuses an existing direct conversation where possible or creates the conversation and memberships under the signed-in user's identity.
- Conversation view loads message history, sends text messages, updates `last_read_at`, listens for incoming messages through Supabase Realtime, and creates short-lived signed URLs for private chat attachments.
- The voice-note control is explicitly disabled until a recording/send backend is implemented. Pinned and archived inbox filters are hidden because no corresponding persistence has been implemented.
- Live project inspection confirmed `messages` and `conversation_members` are in `supabase_realtime`, and existing RLS policies scope message reads/inserts to conversation members and message deletion/updates to senders/admins.

### Verification boundary
- `npm run check`: JavaScript syntax and 24 source-integrity tests pass.
- These are static/integration-contract checks. A signed-in two-account browser test is still required to certify live message delivery, account privacy edge cases, attachments, and mobile behavior.
- Feed media publishing is still a backend service, not a fully enabled Feed composer. Voice/video calling, voice notes, push notifications, and production payment processing remain unimplemented/not certified.

### Feed and notifications integration added
- Added `js/spike-feed-supabase.js` and its stylesheet. The Feed now reads RLS-visible published posts from Supabase, loads author profiles and post media, creates short-lived signed URLs for private post media, supports the For You / Following filters, and exposes a working text/media composer using `SPIKE_POSTS.publishPost()`.
- The composer supports Public, Followers, and Only me visibility. Media is still capped at 6 MB per file and eight files per post by the current publisher service.
- Added `js/spike-notifications.js`. Notifications now load the signed-in user's records, support All / Unread / Mentions / Announcements / System filters and search, mark one or all as read, delete all or read items, show details, and subscribe to the notifications Realtime table.
- These changes supersede the earlier statement above that the Feed composer was still disabled and that notifications had no runtime integration. Story publishing remains intentionally disabled.
- No notification insert policy was added: notification creation remains a server-side responsibility, while users can only read, update, and delete their own notification rows under the verified existing RLS policies.

## Room and account-settings repair pass (2026-11-18)
- Audited the live `rooms`, `room_members`, `room_messages`, `room_invites`, and `room_message_reactions` schemas and their RLS policies against the room frontend.
- Fixed frontend references to the deployed table names and columns: room invitations now use `room_invites`; chat history uses `room_messages` and aliases `reply_to_id`; member lists use `room_members.member_role` and `left_at`; room status refresh uses `rooms.chat_enabled`.
- Room discovery now includes the signed-in owner's own private rooms while keeping public discovery public. Private-room entry still depends on an accepted invitation or existing membership; database RLS remains authoritative.
- Restricted room settings, design publishing, and ending a room to the owner, matching the existing database policies and RPC checks. Participant removal/invites use the owner or active-host authority enforced by the existing RPCs. No database policies were weakened or changed in this pass.
- Added `js/spike-settings-controller.js`. Account privacy now reads/writes only supported profile fields (`is_private`, `presence_visible`, `message_privacy`) for the signed-in user. Feed Following and muted-keyword settings and notification type preferences are stored locally and applied by the Feed/Notifications controllers. Message notification sound respects the existing local sound preference. Controls without corresponding database support are disabled and labelled unavailable.
- Sign out is scoped to the current local session. Browser notifications request permission only after the user clicks Enable.
- Security advisor currently reports one warning: Supabase Auth leaked-password protection is disabled. Enable it in Authentication → Settings / password security if the project plan supports it; see https://supabase.com/docs/guides/auth/password-security. This is a dashboard-level setting and was not changed here.
- Live room inventory at inspection time: 0 live, 0 scheduled, 0 private rooms. Consequently no live room session or two-account member test was possible.
- Verification: `npm run check` passes (52 tests). ZIP integrity passes. These are source/static contract tests, not browser end-to-end tests. The updated source is packaged but has not been deployed to the live website.
- Performance advisor reported 38 indexes as unused in its current usage window. They were not dropped: these indexes support expected Feed, message, room, notification, and wallet query paths, and the project currently has little/no room traffic. Reassess after production query statistics accumulate rather than removing potentially useful indexes prematurely.

## Authentication security follow-up — 2026-11-18

- Added a signed-in password-change form under Settings → Security & Tools. It requires the current password using the supported Supabase JS `auth.updateUser({ password, currentPassword })` flow, validates confirmation and length, and reports errors without logging credentials.
- Hardened `reset-password.html`: a normal existing session alone no longer authorizes password changes. The page requires the Supabase `PASSWORD_RECOVERY` auth event (or an explicit legacy recovery marker) before enabling submission.
- Added automated regression coverage for both flows.
- Supabase Security Advisor still reports **Leaked Password Protection Disabled**. This is a hosted Auth configuration setting and was not changed through SQL; enable it in Authentication → Settings / Password Security if the project plan supports it. Reference: https://supabase.com/docs/guides/auth/password-security
- TOTP enrollment and sign-in challenge are implemented in the frontend. Database/API-wide AAL2 enforcement and an end-to-end recovery flow remain outstanding; do not describe all SPIKE operations as MFA-enforced.


## Authenticator MFA implementation (Nov 18, 2026)
- Added optional TOTP authenticator enrollment in Settings → Security & Tools using Supabase Auth MFA enroll/challenge/verify APIs.
- Added MFA challenge page and routing after password login, OAuth return, and on protected-page navigation when Supabase reports `aal1` with `nextLevel=aal2`.
- Supports multiple verified TOTP factors for backup; UI prevents removing all verified factors through its normal flow.
- This is a client-side route gate. It is **not yet an API/database-wide AAL2 enforcement guarantee**: do not claim every RLS-protected operation requires AAL2 until policies and sensitive storage/RPC paths are audited and enforced.
- Supabase Security Advisor still reports leaked-password protection disabled; enable it in Auth password security settings: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection


## Supabase live database audit (Nov 18, 2026)
- Confirmed every discovered `public` base table has RLS enabled and at least one policy; `storage.objects` also has RLS enabled with bucket/folder policies. Storage's internal metadata tables are managed by Supabase and are not intended for direct client access.
- Reviewed the active public and Storage policies. No blanket AAL2 requirement was added: optional MFA users need conditional enforcement across all relevant tables, RPCs and Storage paths, and a blanket AAL2 policy would lock out users who have not enrolled.
- Security Advisor currently reports one warning: leaked-password protection disabled. Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Performance Advisor reports 38 currently unused indexes. They have not been dropped: the project appears to have low/limited observed traffic, and unused-index counters alone are insufficient evidence that these indexes are safe to remove. Reassess after representative production workload.

- Added Supabase Auth's experimental recovery-code API opt-in, one-time code generation/regeneration and recovery-code login challenge. Recovery codes are displayed only in the generation response and are not persisted by SPIKE. The user must save them securely.

## Supabase remediation batch — 18 Nov 2026

- Deployed migration `spike_room_leave_host_handoff_v1_15` (`20261118205843`). The authenticated room-leave RPC now calls a private, fixed-search-path `SECURITY DEFINER` function that verifies active membership, locks the room row, transfers active hosting to the longest-serving eligible moderator/speaker/listener, and ends an otherwise-empty active/scheduled room. Public wrapper execute is revoked from `PUBLIC`/`anon` and granted to `authenticated` only.
- Deployed migration `spike_opt_in_mfa_rls_and_dml_enforcement_v1_16` (`20261118205959`). A private security-definer predicate checks for a verified factor in `auth.mfa_factors`; users without a verified factor remain allowed at AAL1, while opted-in users require the JWT `aal` claim to be `aal2`.
- Added restrictive `FOR ALL TO authenticated` policies to all 23 public application tables and `storage.objects`. Added before-insert/update/delete guards to all 23 public application tables so authenticated RPCs that execute through `SECURITY DEFINER` cannot bypass the opt-in MFA rule for mutations. The security-definer follower-count/list helpers also check the MFA predicate before returning profile/follow data.
- Verification: live catalog confirms 23 public MFA restrictive policies, 23 public mutation guard triggers, and the Storage objects restrictive policy. A transaction-only simulation inserted a temporary verified TOTP factor, confirmed AAL1 cannot read the enrolled user's profile, confirmed AAL2 can read it, and rolled back the test data. A separate transaction verified the MFA predicate blocks AAL1 and allows AAL2 for a verified-factor user. No test factor was retained.
- Room leave migration was verified in `pg_proc`; the public RPC is invoker-security, denies `anon`, grants `authenticated`, and its private implementation is security-definer with a fixed search path. No live room existed for a real member/host session test.
- `npm run check`: 59/59 automated source/migration-contract tests pass; all JavaScript syntax checks pass. These are not browser/device end-to-end tests.
- Supabase Security Advisor still reports one warning: leaked-password protection is disabled. It requires a Dashboard Auth password-security setting. No SMTP/OAuth/provider settings were changed.
- The live database has 17 migration records, but the delivered source archive previously had no migration SQL baseline. This batch adds the two new remediation migrations only; the first 15 historical migrations still need to be exported/recovered before the local migration directory can fully reproduce the live schema.

## Admin and referral integration follow-up — 18 Nov 2026

- Added `js/spike-admin-controller.js` to connect the existing admin page to supported live data. It verifies the signed-in profile role, loads real counts for registered profiles, registrations today, suspended accounts and live rooms, and connects the Reports queue to the deployed `reports` table with its actual `open`, `reviewing`, `resolved`, and `dismissed` statuses.
- Corrected report source filters to the deployed target types (`profile`, `post`, `comment`, `message`, `room`). Report status updates set `reviewed_by` and `reviewed_at` and remain subject to the live admin RLS policy and opt-in MFA guard.
- User management, identity verification and purchase tabs are explicitly disabled because the live database has no corresponding complete tables/RPC workflows. Unsupported overview metrics display `Not configured` rather than fabricated zeros.
- Referral page now clearly states that the referral/reward engine is not active. Copy/share actions are disabled because the live `referrals` table has no insert/qualification/reward RPC, no personal referral-code field exists on profiles, and there is no secure SP Points settlement workflow. This avoids implying that referral rewards are currently earned.
- These frontend changes pass source checks only; a signed-in admin/moderator browser test is still required to verify report reads and status updates against a real account.
- Verification after this pass: `npm run check` passes 61/61 automated tests and all JavaScript syntax checks. No live admin action or browser E2E was performed because no authenticated admin test session was available.

## Hosting security headers follow-up — 18 Nov 2026

- Corrected the report-only Content Security Policy `connect-src` to allow the configured Supabase HTTPS API and WSS Realtime endpoints alongside Cloudinary uploads. The policy remains report-only intentionally: SPIKE has many inline scripts/styles and still needs browser CSP violation review before moving to enforced CSP.
- HSTS, nosniff, referrer policy, Permissions Policy and frame-ancestors protections remain present in the Cloudflare Pages `_headers` file.
- Supabase API configuration review: only `public` and `graphql_public` are exposed in `supabase/config.toml`; the `private` helper schema is not exposed through the Data API. Supabase CLI is not installed in this environment, so the first 15 historical migration SQL bodies could not be pulled; do not replay the partial local migration folder into a fresh/production database.

## 18 November 2026 — admin directory and truthful metrics

- Enabled the admin account directory as a read-only view backed by `profiles`, `wallet_accounts`, and `reports`.
- Added pagination, search by username/display name/SP ID, role/status filters, wallet summary, and reporter-history count.
- No email addresses, auth credentials, role mutation, account suspension, or account deletion are exposed from the browser. Those require dedicated audited server-side operations.
- Corrected the suspended-account metric to count only `account_status = 'suspended'` (rather than every non-active status).
- Hid unsupported dashboard metrics rather than showing empty or invented values. Four live metrics remain: registered users, registrations today, suspended accounts, and live rooms.
- Removed the referral page's misleading promise of SP Points rewards while the server-side referral qualification and settlement workflow remains unavailable.
- Verification: `npm run check` passes 65/65 automated tests and all JavaScript syntax checks.

## Single-owner admin access — 18 Nov 2026

- Restricted `admin.html` in both the shared protected-page guard and the admin controller to the exact signed-in email `eletexjoeytex@gmail.com`, with an active `admin` profile. Moderators no longer qualify.
- Deployed Supabase migration `spike_single_owner_admin_access` (`20261118211133`). The private `private.is_admin()` predicate now independently verifies the authenticated user's email in `auth.users`, the matching active profile, and the `admin` role. This predicate backs existing database policies for report moderation and other administrative data/actions; browser-side checks are not the only security boundary.
- Updated the live profile role for the specified account to `admin`. Verified the live database returns exactly one `admin`/`moderator` profile: the specified account, active. Other elevated profile roles were normalized to `user`.
- Added a regression test covering the single-owner restriction in the migration, page guard, and admin controller.
- Verification: `npm run check` passes 66/66 tests and all JavaScript syntax checks. Live Supabase migration history confirms the migration is recorded. Security Advisor still reports leaked-password protection disabled; this remains a Dashboard Auth setting.
- Browser sign-in testing and production website deployment have not been performed in this batch.


## Full project and live backend inspection — 18 Nov 2026

- Rechecked the delivered source archive and connected Supabase project after the single-owner admin change.
- Found and corrected a regression-test path mismatch: the owner-admin migration is `20261118211133_spike_single_owner_admin_access.sql`; the test had expected a different timestamp. Added the missing admin pre-authorization visual concealment so the admin shell remains hidden until the shared auth guard confirms the owner account.
- Live database inventory: 23/23 public application tables have RLS enabled; 91 public RLS policies; four Storage buckets; 13 tables in the Realtime publication; four compatibility views all use `security_invoker=true`.
- Storage configuration: `avatars` is public; `post-media`, `chat-attachments`, and `room-media` are private. Storage object policies scope uploads/updates/deletes to the uploader's user-ID folder and private media reads to owner/member visibility checks. MFA restrictive policy is present on `storage.objects`.
- Single-owner verification: the only live profile with `admin` or `moderator` role is `eletexjoeytex@gmail.com`, with `admin` role and active status. The private `private.is_admin()` function verifies the auth user email, profile role and active status; its execute grant is limited to authenticated users.
- Live data remains essentially empty: one profile and one wallet account; zero posts, messages, notifications, rooms, and wallet-ledger entries. This limits realistic multi-user integration verification.
- Security Advisor: one warning remains — Supabase Auth leaked-password protection is disabled and must be enabled in the Dashboard. Health Advisor reports no findings. Performance Advisor lists 38 unused indexes; no indexes were dropped because the database has virtually no production workload yet.
- MFA status: the live Auth catalog currently reports zero verified MFA factors. MFA enforcement is opt-in until a user enrolls a factor. The owner should enroll an authenticator and safely store recovery codes before treating the admin account as strongly protected.
- Hosting CSP remains report-only pending browser violation review; switching to enforced CSP without testing could break existing inline scripts/styles. SMTP/OAuth provider configuration, production redirect allow-lists, live Cloudinary preset restrictions, and website deployment status could not be verified from the available project/database interfaces.
- The first 15 historical Supabase migration SQL bodies remain unavailable locally. The latest three remediation migrations are present; the local migration directory is not yet a complete reproducible baseline. Do not replay it against production or a fresh project until the baseline is recovered.
- Automated verification: `npm run check` passes 66/66 tests and JavaScript syntax checks. Static references and HTML source-integrity checks pass. No real browser/device end-to-end test or signed-in owner report-moderation test has been performed.

## Phase 13 — support contact and consistency corrections (19 Nov 2026)

- Published the configured WhatsApp support contact `09159096952` in the Help Centre as a direct WhatsApp link. The page explicitly says this is for support/payment-instruction follow-up only, not a bank account or transfer destination. The support email remains unconfigured because no official support email was supplied.
- Corrected Cloudinary raw-file size documentation to match the implemented 10 MB client-side limit and refreshed stale messaging integration notes to reflect the current inbox/conversation controllers.
- Updated the retired-provider regression test so it permits the currently configured support number while continuing to reject the old provider email and worker endpoint.
- Verification: `npm run check` passes 101/101 tests and all external JavaScript syntax checks pass. These are source-level tests, not signed-in browser/device tests.
- Live Supabase recheck: all 27 public tables have RLS enabled; the six coin packages and two Verified plans remain active; the single-owner predicate still checks the designated email, active account and admin role; all four expected Storage buckets remain present. No purchase orders exist yet.
- Remaining external/security checks: enable leaked-password protection in Supabase Auth; complete a real signed-in customer-to-owner payment/settlement test; verify Cloudinary preset restrictions and deployed unsigned uploads; perform multi-account browser/mobile QA; confirm SMTP/OAuth/redirect and hosting configuration. Do not treat this ZIP as proof of production deployment.
