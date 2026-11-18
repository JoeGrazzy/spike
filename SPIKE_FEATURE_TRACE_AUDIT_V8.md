# SPIKE feature trace audit — V8

Date: 2026-11-18
Source: SPIKE_SUPABASE_PREFLIGHT_FIXED_V7.zip
Live Supabase project: cjqpyndceqyqsijihxbb

## Scope completed in this pass

- Scanned 77 HTML and JavaScript files for direct Supabase RPC and table calls.
- Compared 133 distinct frontend RPC names against the live `public` function catalog: all names exist.
- Compared 22 distinct frontend `.from()` table/view names against the live `public` schema: all exist.
- Checked local script and stylesheet imports in the HTML pages: no missing local imports and no duplicate local imports within a page were found.
- Checked local `src` and `poster` asset references: no missing local assets were found.
- Checked public base-table RLS status: all 115 public base tables have RLS enabled.
- Inspected direct-write call sites and the matching table grants and RLS policies for messaging, inbox preferences, feed blocks, profile documents, onboarding, and signal-lens data.
- Inspected Storage bucket configuration and `storage.objects` policies for private message media and room cover assets.
- Reviewed recent Postgres API error logs for missing relations, permissions, voice-note validation, and retired calling endpoints.

## Confirmed repair applied to live Supabase

The frontend marks incoming direct messages as read by calling `.update({ read: true })` on `public.private_messages` from both `message.html` and the room DM panels. The live database had an UPDATE RLS policy but did not grant the `authenticated` role table-level UPDATE privilege. This was a real frontend/database permission mismatch.

Migration applied:

- Version: `20261118091925`
- Name: `spike_private_messages_read_receipt_update_grant`
- SQL: `GRANT UPDATE ON TABLE public.private_messages TO authenticated;`

Verification after applying:

- `has_table_privilege('authenticated', 'public.private_messages', 'UPDATE')` = true
- One participant-scoped UPDATE policy remains in place, with both `USING` and `WITH CHECK` restricted to conversation participants.
- The `trg_spike_guard_private_message_update` trigger remains installed. Its body prevents changing message identity/content and limits allowed participant updates to recipient read-state changes or sender soft-deletion.
- No DELETE privilege was granted.

## Calling removal verification

The V7 frontend source has no active WebRTC, peer-connection, call-signaling, DM-call, or Rooms live-audio session implementation references in its HTML/JavaScript/CSS source. Live catalog checks confirmed:

- `public.spike_dm_calls_v2` does not exist.
- `public.spike_dm_call_ice_v2` does not exist.
- `private.spike_room_live_audio_sessions` does not exist.
- No public/private function names containing `call` or `live_audio` remain.
- `user_app_settings` has no incoming/outgoing call-tone columns.

Historical Postgres logs do contain requests from the earlier calling implementation and reads of the removed call-tone columns. These are historical requests made before the removal migration, not evidence that the current V7 source still contains calling code.

## Voice-note checks and remaining uncertainty

The current `message.html` upload payload matches the live `spike_guard_private_message_insert()` validation contract on inspection: sender/recipient path, attachment object, non-empty size, audio MIME type, bounded size, and empty body. The Storage policies also distinguish the current private-message bucket from legacy `dm-media` objects.

However, recent historical Postgres logs contain three `Invalid voice message payload` rejections on 2026-11-18 around 05:54–05:55 UTC. The log query does not expose the original JSON parameter values, so it is not possible to prove which validation field failed or that the current V7 build has eliminated the rejection. A real authenticated send-and-play test is still required.

## Security and performance notes

- The Supabase health advisor returned zero health lints.
- Security advisor still reports 252 authenticated-executable SECURITY DEFINER functions and two anon-executable SECURITY DEFINER functions. The two anon functions currently include the public policy-health read function and the unauthenticated safety-recovery-token redemption flow. These need individual authorization review; blanket revocation would break legitimate features.
- Performance advisor reports unused-index notices and one duplicate index. These are not removed in this pass because index usage depends on workload and duplicate constraints may be backing uniqueness requirements.
- Some anon table grants coexist with authenticated-only RLS policies. They do not bypass RLS, but should be reviewed for least-privilege cleanup in a separate permission pass.

## Not claimed as completed

This is a static source/catalog/policy/log trace, not a full authenticated browser QA run. It does not prove that every button works on a real device, that all real-time subscriptions recover, or that payment, gifts, wallet, feed, friend, profile, notification, admin, and Rooms workflows succeed end-to-end. Those require authenticated test sessions and controlled test data. No purchase, wallet write, gift, deletion, or user-data mutation was performed as part of this audit.
