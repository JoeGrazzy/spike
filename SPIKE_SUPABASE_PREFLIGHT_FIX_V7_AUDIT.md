# SPIKE Supabase preflight and missing-relation repair — V7

## Confirmed root cause
The live `private.admin_dashboard_stats()` function queried `private.spike_room_live_audio_sessions` while that relation did not exist in the live database. This caused the admin dashboard statistics RPC to fail.

## Product alignment
The supplied V6 source has the current Rooms discovery and room pages in chat-only mode. It contains no active live-audio session implementation. The admin page still displayed an obsolete “Live audio rooms” metric and required the obsolete JSON key.

## Live Supabase repair
Applied migration `20261118090937_spike_admin_dashboard_remove_orphan_live_audio_metric` to project `cjqpyndceqyqsijihxbb`.
- Removed the query against the missing relation.
- Kept `live_audio_rooms: 0` in the JSON response for backward compatibility with any older clients.
- Preserved the function's owner authorization check, `SECURITY DEFINER`, `STABLE`, and empty search_path settings.
- No table was created; no data, storage objects, RLS policies, grants, or user records were deleted or modified.

## Frontend alignment
- Removed the obsolete Live audio rooms card from `admin.html`.
- Updated the metric count from 14 to 13.
- Removed the obsolete key from the current admin renderer's required-stat list.

## Verification
- Confirmed the migration is recorded in `supabase_migrations.schema_migrations`.
- Confirmed no live database function definition still references `spike_room_live_audio_sessions`.
- Confirmed the updated function definition returns `live_audio_rooms: 0` for compatibility.
- Current ZIP static validation: see final response for measured checks.

## Not claimed
This does not prove every SPIKE feature works end-to-end. Authenticated two-user, browser/device, payment-provider, and realtime tests are still needed. No new calling or live audio feature was reintroduced.
