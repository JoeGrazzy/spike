# SPIKE Room Join Fix — 2026-10-06

## Root cause

Room join inserts into `public.room_members`. The table has no `collection_name` column.

The shared `public.trg_spike_gamification_user()` trigger was written with this condition:

```sql
elsif TG_TABLE_NAME='app_documents' and new.collection_name='posts' then
```

On the `room_members` trigger path, PostgreSQL could evaluate `new.collection_name` against the `room_members` record and raise `42703: record "new" has no field "collection_name"`.

## Fix

The trigger now branches on `TG_TABLE_NAME='app_documents'` first and only then reads `new.collection_name`. The `room_members` path reads only `new.user_id`.

No Room table, RLS policy, RPC contract, or gamification data model was changed.

## Verification

- Live Supabase migration applied: `fix_room_member_gamification_trigger_collection_reference`
- Rollback-safe real `room_members` insert completed without error.
- Supabase migration history confirms the fix is installed.
- Full project audit: **388 tests, 387 passed, 0 failed, 1 skipped**.
- The skipped test is the optional live browser/WCAG audit because browser dependencies are unavailable in this environment.
- `node --check js/spike-native-v2.js` remains part of the project check suite and passes through the existing regression workflow.
