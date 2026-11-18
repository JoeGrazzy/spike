# SPIKE — Supabase setup and integration handoff

## Connected Supabase project

- Project: `Spikemediachat`
- Project ref: `veagqanfilmbchlvlpcc`
- URL: `https://veagqanfilmbchlvlpcc.supabase.co`
- Region: `eu-west-1`
- Browser key: Supabase publishable key is configured in `js/spike-supabase-client.js`. It is designed for public browser use; access is controlled by database grants and RLS.
- No service-role or secret key is included in this repository.

## Database foundation applied

The following migrations were applied to the connected project:

1. `spike_application_foundation_v1`
2. `spike_security_hardening_v1_1`
3. `spike_api_access_corrections_v1_2`
4. `spike_policy_and_message_fixes_v1_3`
5. `spike_social_compatibility_api_v1_4`
6. `spike_presence_privacy_fix_v1_5`
7. `spike_api_invoker_hardening_v1_6`
8. `spike_follow_request_upsert_fix_v1_7`
9. `spike_rooms_compatibility_and_dm_v1_8`
10. `spike_room_rpc_grants_v1_9`
11. `spike_room_start_rpc_v1_10`
12. `spike_room_fk_indexes_v1_11`
13. `spike_room_capacity_and_chat_guards_v1_12`
14. `spike_room_realtime_authorization_v1_13`
15. `spike_room_rpc_acl_hardening_v1_14`
16. `spike_room_leave_host_handoff_v1_15`
17. `spike_opt_in_mfa_rls_and_dml_enforcement_v1_16`
18. `spike_single_owner_admin_access`

The foundation and follow-on integrations contain 23 public application tables and four compatibility views:

- `profiles`, `follows`, `blocks`
- `posts`, `post_media`, `comments`, `post_likes`, `saved_posts`
- `conversations`, `conversation_members`, `messages`, `message_reactions`
- `notifications`
- `rooms`, `room_members`, `room_messages`
- `reports`
- `wallet_accounts`, `wallet_ledger`, `referrals`
- `room_message_reactions`, `room_invites`, `private_messages`

Compatibility views: `spike_rooms`, `spike_room_members`, `spike_room_messages`, and `spike_room_invites`.

RLS is enabled on all 23 application tables (91 public policies at the latest Phase 1 verification). Supabase security and health advisors returned no findings; the performance advisor reports only unused-index INFO notices because the new tables have no production traffic yet. The schema includes profile creation on Auth signup, wallet-account initialization, privacy-aware conversation creation, room-host membership initialization, least-privilege column grants, and private helper functions. Thirteen tables are registered with `supabase_realtime`. Four storage buckets are configured: `avatars` (public reads, owner-only writes), `post-media`, `chat-attachments`, and `room-media` (private, RLS-scoped). 

## Browser integration added

- `js/spike-supabase-client.js`: ESM facade over the early-loaded Supabase client.
- The classic bootstrap initializes Supabase Auth with PKCE, session persistence and token refresh.
- `js/spike-auth.js`: email/password sign-in, signup, signup OTP verification/resend, password-reset email, Google/GitHub OAuth entry points.
- `js/spike-password-reset.js`: consumes a recovery session and updates the password.
- `js/spike-supabase-guard.js`: requires an active account on app pages, and checks moderator/admin role for `admin.html`.
- `js/spike-platform-bootstrap.js`: early classic-script bridge for existing controllers that expect `SPIKE_PLATFORM`, `SPIKE`, or a global Supabase client.
- `js/spike-rooms-controller.js` and `js/spike-room-bootstrap.js`: room discovery, room creation, public/private membership checks, scheduled-room start, and connection context for the existing live room chat UI.
- A compatibility RPC layer now supports profile visibility, profile lookups, follow lists/counts, friend-request transitions, block/unblock, report submission, and deleting/editing a user's own post.

The client only contains the publishable key. Never add a service-role key to HTML, JavaScript, static hosting variables, or browser build artifacts.

## Required dashboard configuration before real users can sign in

1. In Authentication → URL Configuration, set the production Site URL and add the exact allowed redirect URLs for `index.html`, `feed.html`, and `reset-password.html` on the deployed domain (and local development origin if needed).
2. Configure the Auth email templates. The registration screen expects a six-digit signup OTP; configure the Confirm signup template to render `{{ .Token }}`. If using a confirmation link instead, the UI needs to be changed to match that flow.
3. Enable Google and GitHub providers and add each provider's client ID/secret and callback URL in Supabase and at the provider consoles. The UI buttons are wired, but provider sign-in will not work until configured.
4. Review SMTP/email delivery, rate limits, CAPTCHA/abuse controls, password policy, MFA policy, and production redirect allowlists.
5. Create the first trusted administrator deliberately. The `profiles.role` column is not user-editable; promote a verified account from the SQL editor using a reviewed owner-level operation. Do not expose an admin role-setting endpoint to the browser.
6. In Realtime → Settings, disable **Allow public access** so private room channels are actually enforced by the new `realtime.messages` policies.
7. Confirm the deployed site uses HTTPS and set the correct custom domain in Supabase Auth settings.

## Current project state

At the latest Phase 1 check the project has one Auth user (the designated owner) and zero deployed Edge Functions. No test account was created. The application tables are otherwise empty; profile and wallet-account rows are created by the Auth signup trigger.

## Important integration boundary

The uploaded archive explicitly describes itself as a frontend-only handoff. This pass wires the authentication entry points and route guard, but the existing feed, full profile page, primary messaging pages, notifications, wallet, referrals, and admin page controllers are not yet converted from their current UI/runtime behavior into complete Supabase CRUD flows. Room discovery, creation, membership, capacity enforcement, private Realtime authorization, room chat, reactions, invites, moderation removal, settings, direct messages within rooms, and room reports have a first Supabase path; gifts and some advanced host controls remain disabled or unsupported. The follow/profile RPC compatibility layer is present, but it does not make every legacy page controller complete. The schema is a secure foundation, not proof that those features are fully operational. In particular:

- wallet balances and ledger writes are read-only to browser users and require trusted payment/ledger Edge Functions plus payment-provider verification;
- notification creation, moderation actions, and admin workflows need server-side functions and an initial admin bootstrap;
- realtime subscriptions need feature-specific client controllers and presence design;
- room gifts remain hidden until a verified wallet ledger and payment/gifting workflow is implemented; banning, co-host management, and advanced room moderation are not complete;
- voice/video calling is not included in the archive and needs a separately selected provider and credentials;
- production browser/device end-to-end testing, backup/restore testing, privacy/legal review and monitoring are still required.

## Migration source note

The connected project records the migrations in Supabase migration history. The archive includes only the last three migration SQL files; the first 15 SQL bodies are not bundled as replayable local migration files. The live project records all 18 migrations. Do not replay the partial folder; To pull the canonical remote schema/migration state into a developer workstation, authenticate the Supabase CLI and run `supabase link --project-ref veagqanfilmbchlvlpcc` followed by `supabase db pull`. Review the generated SQL before committing it.

## Local checks

Run `npm run check` with Node.js installed. It checks JavaScript syntax and the existing source-integrity tests. It does not validate the remote Auth configuration or replace browser/device end-to-end tests.

## Media storage routing update

- Public profile avatar and cover images upload to Cloudinary; the returned HTTPS URL is saved in `profiles.avatar_path` / `profiles.cover_path` for the authenticated owner.
- Private direct-message attachments upload to the private Supabase `chat-attachments` bucket under `<user-id>/<conversation-id>/...` and are referenced by `messages.attachment_path` / `attachment_type`.
- The private attachment bucket remains private, retains its 50 MB limit, and now allows supported image/video/audio/PDF/office/text/archive MIME types. RLS read authorization is conversation-member scoped; upload ownership is tied to the first folder segment.
- `js/spike-media-routing.js` exposes `window.SPIKE_MEDIA` helpers for public Cloudinary media and private Supabase files. See `STORAGE_ROUTING.md` for the routing matrix and implementation limits.
