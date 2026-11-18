# SPIKE feature trace audit — V9

Date: 2026-11-18  
Source: `SPIKE_FEATURE_TRACE_AUDIT_FIXED_V8.zip`  
Live Supabase project: `cjqpyndceqyqsijihxbb`

## What was checked in this pass

### Frontend static integrity

- 26 HTML pages, 51 standalone JavaScript files, 82 CSS files.
- 66 inline JavaScript blocks extracted from HTML.
- `node --check`: zero errors in standalone and inline JavaScript.
- CSS parsing with `tinycss2`: zero parse errors.
- No duplicate local script or stylesheet imports within any HTML page.
- No missing local HTML page targets among 19 linked page targets.
- Asset paths that are generated dynamically in JavaScript templates were not treated as literal missing files.
- The source still contains no active direct-call/WebRTC implementation. Voice notes remain separate from calling. Rooms remain chat-only.

### Frontend-to-database mapping

- 133 distinct RPC names extracted from frontend source. Every name exists in the live public function catalog and at least one matching overload is executable by `authenticated`.
- 22 distinct direct `.from()` table/view names exist in the live public schema. All 22 have RLS enabled.
- Read/write privilege checks were performed for the 22 directly referenced tables. The authenticated role has the table-level privileges needed by the observed direct client writes; row access remains controlled by RLS.
- Storage configuration contains `private-message-media` (private), `dm-media` (private legacy compatibility), and `spike-room-assets` (public room assets). `storage.objects` policies restrict private message media to conversation participants and uploads/deletes to the sender path; room-cover writes are constrained to the active room host.

## Live database repairs applied

### 1. Read receipts — migration `20261118091925`

Granted `UPDATE` on `public.private_messages` to `authenticated`. The participant-scoped UPDATE RLS policy and `trg_spike_guard_private_message_update` trigger remain in place; no DELETE privilege was granted. Catalog verification confirms the privilege is active.

### 2. Remove unused anonymous table grants — migration `20261118092734`

Revoked all `anon` table privileges on:

- `public.app_documents`
- `public.feed_blocks`
- `public.spike_inbox_preferences`

Each table has RLS enabled and only authenticated-scoped policies for the relevant operations. Verification confirms `anon` now has no SELECT, INSERT, UPDATE, or DELETE table privilege on these three tables. Authenticated grants and all eight relevant RLS policies were preserved.

### 3. Remove duplicate index — migration `20261118092920`

Dropped only `public.spike_room_reports_room_reporter_uq`, a standalone duplicate of the unique index backing constraint `spike_room_reports_room_id_reporter_id_key`. The unique constraint and its backing index remain. The performance advisor no longer reports a duplicate index.

### 4. Earlier V7 fix retained

The admin dashboard no longer references the removed private Rooms live-audio session relation. `admin_dashboard_stats` returns a compatibility metric of zero rather than querying the deleted relation.

## Runtime log cross-checks

- `touch_user_presence` had historical permission-denied entries on 2026-11-17. The current function grants `EXECUTE` to `authenticated`; recent requests on 2026-11-18 returned HTTP 200. No additional permission change was needed.
- Three `Invalid voice message payload` errors appear at 05:54–05:55 UTC on 2026-11-18. The storage-backed voice-note validation migration was applied at 06:02 UTC. The current frontend payload shape matches the current trigger checks (sender/recipient path, positive size, audio MIME type, empty body, 12 MiB maximum). No further matching rejection appeared in the subsequent 24-hour log query. This is encouraging log evidence, not a substitute for a real authenticated send/play test.
- Historical missing-relation errors for `private.spike_room_live_audio_sessions` and the removed call-tone columns predate the removal/repair migrations; they are not present in the current frontend source.

## Remaining security items — not blindly changed

1. **Three private-schema tables have RLS disabled:** `private.rpc_authorization_audit`, `private.spike_debug_reports`, and `private.spike_moderation_decisions`. Direct catalog checks show `anon` has no `private` schema USAGE and no table privileges; `authenticated` has schema USAGE but no table privileges on these tables. They are not directly exposed through the browser table API under the current grants. Do not simply enable RLS without reviewing the SECURITY DEFINER/backend access paths and adding appropriate policies.
2. **252 authenticated-executable SECURITY DEFINER functions** are reported by the Supabase security advisor. These are not safe to revoke in bulk because SPIKE's authenticated RPC workflows depend on them. Review each function's authorization guard, search path, and data access individually.
3. **Two anon-executable SECURITY DEFINER functions** remain: `get_spike_policy_health()` (returns aggregate policy-health counts) and `spike_consume_safety_recovery(text,text)` (unauthenticated one-time token-based password recovery). Their current behavior was inspected; both appear to have intentional public use cases, but should remain under focused security review.
4. **Leaked-password protection is disabled** in Supabase Auth. Enable it in the project's Auth password/security settings.
5. Performance advisor still reports 3 unindexed foreign keys and 135 unused-index notices. No unused indexes were dropped because usage statistics alone do not establish that an index is safe to remove.
6. Health advisor reports zero health lints.

## Explicit limits

This is a static source/catalog/policy/log audit and targeted live database hardening, not full authenticated browser QA. It does not prove every button, real-time recovery path, payment, gift, wallet, feed, friend, profile, notification, admin, or Rooms workflow succeeds end-to-end on a real device. Those flows need authenticated test accounts and controlled test data. No purchase, wallet write, gift, deletion, or user-data mutation was performed during this pass.

## Preserved product decisions

- No direct voice calls or video calls were reintroduced.
- Voice notes remain compact and independent from calling.
- SPIKE Rooms remains chat-only.
- Existing messaging, wallet, gifts, feed, profile, friends, notifications, admin, auth, and navigation source was preserved.
