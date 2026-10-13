# SPIKE — Messages Presence Timestamp Fix

Date: 2026-10-13

## Implemented
- Added `js/presence-timestamps.js` and wired it into `messages.html` after the existing shared presence runtime.
- Inbox conversations now hydrate persistent last-seen timestamps and show relative values such as “Last seen 5 min ago”; hovering/focusing the label exposes the exact local date/time.
- Live online state remains driven by Supabase Realtime Presence. The timestamp helper does not override a live online state and does not let an older database timestamp replace a newer in-memory timestamp.
- Added migration `20261013124500_spike_dm_presence_timestamps_v1.sql` to persist authenticated user activity in `public.user_presence` and expose privacy-filtered presence through bounded RPC lookup (maximum 100 IDs).
- Target users with `profile_privacy.show_online_status = false` are excluded from lookup. Direct table access is revoked; authenticated clients use the restricted RPCs.
- Left the protected `js/presence.js` baseline untouched.

## Verification
- New presence timestamp regression tests: 3 passed.
- Protected baseline and migration version checks: passed.
- `node --check` across JavaScript files: passed.
- `node inline-check.js`: passed.
- Full test suite: 532 passed, 0 failed, 1 skipped (optional browser accessibility audit).
- ZIP integrity checked after packaging.

## Deployment caveat
The migration has been added to the project archive but has **not** been applied to a live Supabase project. Persistent last-seen timestamps require applying the migration to the authorized Supabase environment. Live realtime, RLS/RPC behavior, and browser/device presentation still require staging verification.
