# SPIKE — Private Message Lifecycle Rebuild v1

**Date:** 12 November 2026  
**Project:** `cjqpyndceqyqsijihxbb` (SPIKE)  
**Scope:** Direct-message attachments, reactions, sender deletion, and Storage-object cleanup.

## Deployment status

- Database migration `20261112035419_spike_dm_lifecycle_unification_v1` applied successfully.
- Follow-up migration `20261112035519_spike_dm_delete_redaction_fix_v1` applied successfully.
- Edge Function `spike-dm-media-cleanup` deployed and ACTIVE at version 1 with JWT verification enabled.
- Frontend changes are staged in the rebuilt ZIP. The hosted website itself was not deployed by this operation.
- Existing messages and existing Storage objects were not bulk-deleted or migrated destructively.

## What was unified

### 1. Reactions

- `private_message_reactions` now has one primary key: `(message_id, user_id)`.
- The redundant unique index on the same pair was removed as the pair became the primary key.
- The allowed direct-message reaction is the existing heart reaction (`❤️`), matching the current DM interface.
- `dm_toggle_reaction` is the sole write path. It performs a delete-or-insert atomically and handles concurrent insert conflicts.
- The message page no longer performs a client-side upsert/delete toggle. Failed reaction writes are not shown as successful local-only reactions.
- The existing participant-scoped RLS policies remain enabled.

### 2. Deletion and redaction

- The message page now calls `dm_delete_message` rather than issuing a direct table update.
- The RPC is sender-only and idempotent for already-deleted messages.
- The RPC explicitly clears `body`, `attachment`, `media_path`, `media_mime_type`, and `voice_duration_seconds`, as well as setting `deleted_at` and `updated_at`.
- This explicit redaction is required because the existing update guard intentionally bypasses privileged SECURITY DEFINER callers.
- Soft deletion removes reactions and attachment metadata through the single cleanup trigger path.
- Hard message deletion also queues associated storage paths before cascading metadata deletion.

### 3. Attachment storage

- New uploads continue to use the private `private-message-media` bucket with the existing 50 MiB limit.
- New attachment links are signed for 60 seconds and generated with a download filename, rather than exposing a permanent public URL.
- The page now reads legacy `private_message_attachments` metadata and can still open legacy objects from the private `dm-media` bucket.
- Legacy support is read-only compatibility; new uploads continue to use the canonical bucket.
- The legacy bucket and existing legacy objects were deliberately retained. They must not be removed until all legacy records are reviewed and any required files are migrated.

### 4. Physical file cleanup

- A private RLS-enabled queue, `public.spike_dm_media_cleanup_queue`, records bucket/path pairs when a message is soft-deleted or hard-deleted.
- The database trigger captures paths from current JSON attachment metadata, legacy `media_path`, and `private_message_attachments` before metadata is cleared.
- The database does not attempt to delete Storage files by directly modifying `storage.objects`.
- The new JWT-protected Edge Function uses the service-role key server-side to call the Storage API, marks successful jobs done, and returns failed jobs to pending with exponential backoff.
- The conversation page invokes the cleanup function when an authenticated user opens a DM and after a successful message deletion. This provides retry-on-next-DM-session behavior; no scheduled cron trigger was configured in this pass.

## Verification performed

- Confirmed the reaction primary key is `(message_id, user_id)`.
- Confirmed the reaction constraint is `reaction = '❤️'`.
- Confirmed queue RLS is enabled and the table has no client-facing policies.
- Confirmed both the soft-delete cleanup trigger and hard-delete queue trigger exist.
- Confirmed `authenticated` can execute `dm_toggle_reaction` and `dm_delete_message`, while `anon` cannot.
- Confirmed the live delete RPC clears all message content and media metadata.
- Confirmed `private-message-media` remains private with a 52,428,800-byte limit.
- Confirmed the cleanup queue currently contains 0 jobs and the reaction table contains 0 rows.
- New lifecycle tests: **4 passed, 0 failed**.
- All inline scripts in `message.html`: `node --check` passed.
- Full ZIP test suite: **621 passed, 9 failed, 1 skipped**. The 9 failures are the same pre-existing theme/onboarding/notification coverage failures seen in the earlier baseline audit; the new lifecycle tests all pass. The protected-baseline test now passes with intentional `message.html` and deployment-manifest changes recorded.
- Supabase security advisors still report existing platform-wide findings (including 3 pre-existing anon-executable SECURITY DEFINER functions and an INFO notice for the intentionally policy-less cleanup queue). No new anon execute grant was left on the two DM RPCs or trigger function.

## Existing data deliberately preserved

The audit previously observed:

- 1 object in `private-message-media` without a live message JSON reference.
- 2 objects in `dm-media` referenced by 2 legacy attachment metadata rows.

These files were not deleted. The legacy rows remain available to the compatibility reader. The apparent orphan in the canonical bucket remains for manual review; this rebuild does not assume that an unreferenced object is safe to destroy.

## Files changed in the rebuilt ZIP

- `message.html`
- `supabase/migrations/20261112035419_spike_dm_lifecycle_unification_v1.sql`
- `supabase/migrations/20261112035519_spike_dm_delete_redaction_fix_v1.sql`
- `supabase/functions/spike-dm-media-cleanup/index.ts`
- `supabase/functions/spike-dm-media-cleanup/deno.json`
- `supabase/edge-function-deployment-manifest.json`
- `js/audit/tests/dm-lifecycle-unification-v1.test.mjs`
- `js/audit/protected-baseline.json` (updated hashes for the two intentionally modified protected files)

## Remaining deployment step

Replace the currently hosted `message.html` with the `message.html` from the rebuilt ZIP. The database migrations and cleanup Edge Function are already live. After the frontend is deployed, test with two real accounts: send a file, open it from both participants, react/unreact from both participants, delete as sender, confirm recipient sees the redacted state, and confirm the queue job reaches `done` and the Storage object is removed. Do not delete the legacy `dm-media` bucket until its two existing referenced files have been verified and migrated or intentionally retired.
