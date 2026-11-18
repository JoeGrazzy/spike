# SPIKE Phase 1 — canonical source/backend baseline

**Baseline:** `SPIKE_ALL_HTML_PAGES_FIXED.zip` (18 Nov 2026, 22:01 UTC as recorded in Library)
**Supabase project:** `veagqanfilmbchlvlpcc` (`Spikemediachat`)
**Inspection mode:** read-only against production; no production schema/data/configuration was changed.

## Source package integrity

- ZIP integrity: valid; 200 archive entries.
- Source inventory: 27 HTML pages, 50 JavaScript files, 64 CSS files, 14 test files, 3 local SQL migration files, plus assets and docs.
- `npm run check`: PASS — all JavaScript syntax checks and 72/72 Node regression tests pass.
- Existing checks cover duplicate IDs, duplicate/missing local CSS/JS references, module reachability, inline/external JS syntax, and multiple feature contracts.
- These are static/source tests, not browser/device E2E tests.

## Live Supabase baseline (read-only)

- 18 migration history records exist remotely, versions `20261118182458` through `20261118211133`.
- Only three corresponding migration SQL files are present in this ZIP (v1.15, v1.16 and single-owner admin). The first 15 SQL bodies are not present locally.
- 23 public application tables; RLS enabled on all 23; 91 public policies.
- Four compatibility views are described by the existing project audit; 13 application tables are in `supabase_realtime`.
- Four Storage buckets: public `avatars`, private `post-media`, `chat-attachments`, `room-media`.
- No deployed Edge Functions.
- One Auth user/profile, the designated owner `eletexjoeytex@gmail.com`, with active admin role. No verified MFA factor exists yet.
- Live application tables are effectively empty (no posts, messages, rooms, or ledger transactions), so multi-user and concurrency behavior cannot be validated against existing data.

## Canonical schema ownership and migration recovery

Do not replay the three local migration files against production: they are already recorded in the live migration history. Do not invent/reconstruct the missing first 15 migration bodies from migration names or current schema. Before any further DDL, recover a canonical schema snapshot and migration baseline using an authenticated Supabase CLI `db pull` in an owner-controlled development workspace; review and commit the resulting SQL. Compare that snapshot to the live migration history and current schema before authoring the next forward-only migration.

## Frontend-to-backend RPC contract audit

The source invokes these deployed public RPCs successfully by name according to the live function catalog: `accept_friend_request`, `cancel_friend_request`, `decline_friend_request`, `dm_block_user`, `dm_unblock_user`, `dm_unfriend`, `get_friends_public`, `get_public_profiles`, `get_public_profile_posts_v4`, `get_spike_follow_counts`, `get_spike_follow_list`, `get_spike_view_profile`, `send_friend_request`, `spike_room_accept_invite`, `spike_room_get_reactions`, `spike_room_moderate_member`, `spike_room_react_message`, `spike_room_report`, `spike_room_send_invites`, `spike_room_send_message`, `spike_room_send_reply`, `spike_room_transfer_host`, `spike_room_update_appearance`, `spike_room_update_settings_v2`, `spike_rooms_end`, `spike_rooms_leave`, `spike_rooms_start`, and `spike_submit_abuse_report`.

The room-gifting UI invokes three RPCs that are absent from the live catalog: `spike_room_gift_recipient_eligibility`, `spike_send_room_gift`, and `spike_wallet_coin_source_summary`. It also queries `public.spike_gifts`, which is absent. Gifting is therefore not backend-operational and must remain disabled until a reviewed wallet/gift ledger design exists.

## Messaging overlap

The schema contains both conversation-based direct messaging (`conversations`, `conversation_members`, `messages`, `message_reactions`) and a separate `private_messages` table. The room feature's embedded DM currently reads/writes `private_messages`; the primary inbox controller uses the conversation model. This is a real overlapping product capability, but not proof of a safe drop-in consolidation. Next step: document data semantics, attachment paths, read receipts, blocks, and realtime requirements; then select one canonical DM model and migrate callers/data only after a compatibility plan and tests exist. Do not drop either table in Phase 1.

## Feed composer behavior

`feed.html` contains a legacy cleanup observer that removes legacy composer/story elements and retires story entry points. The Supabase feed controller dynamically injects a separate `#spikeNativeComposer` and binds it to `SPIKE_POSTS.publishPost()`. Therefore the old cleanup script does not, by itself, prove that all post publishing is removed. Browser E2E must verify that the dynamically inserted composer remains visible, usable, and not repeatedly removed by the observer.

## Production readiness blockers

1. Recover and commit the canonical migration baseline before further DDL.
2. Build wallet/payment settlement with server-authoritative idempotency and an immutable ledger before enabling purchase, gift, payout, referral rewards or SP Points.
3. Keep unsupported UI actions disabled; do not simulate successful payments, credits, referrals or gifts.
4. Complete owner MFA enrollment and verify AAL2-protected admin actions; enable leaked-password protection in Supabase Auth settings.
5. Configure and verify SMTP, redirect allowlists, OAuth providers, hosting, CSP enforcement, Cloudinary unsigned preset restrictions and backups.
6. Run browser/device E2E with at least two ordinary test accounts plus the designated owner in a staging environment.

## Rules for all subsequent work

- One shared Supabase client and auth/session guard.
- One canonical controller/service per feature; no duplicate RPC/table/controller until the existing contract is understood.
- Keep privileged credentials server-side; browser uses publishable key only.
- Keep financial writes server-side, transactional, auditable and idempotent.
- RLS is authorization, not an obstacle to bypass.
- Add forward-only, reviewed migrations; never patch production ad hoc or replay historical SQL.
- Run `npm run check` after each source change and browser E2E before release.
