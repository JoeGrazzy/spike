# SPIKE Final Hardening Pass

## Completed
- Server-derived event ticket coin pricing; legacy client-price RPC disabled.
- Event purchase requests bound to authenticated room membership and future events.
- Event ticket claims use the stored event_id when available.
- Share-count RPC accepts exactly one increment per call and rejects deleted/missing posts.
- Added indexes for event lookup, purchase-request user/status, purchase-request event, and weekly completion challenge lookup.
- Consolidated theme.css + theme-v14.css while preserving cascade order.
- Consolidated feed-core-1.css + feed-core-2.css while preserving cascade order.
- Removed obsolete theme-v13.css and split feed/theme files.
- Converted 10 large level-badge PNGs to WebP and updated references.
- Removed generated stale dist before rebuilding it.
- Removed duplicate Supabase client creation in room_chat.html.
- Added npm test and npm audit scripts.

## Verification
- JavaScript syntax audit: PASS (24 files).
- Static audit: PASS (15 required pages, navigation and credential checks).
- Production build: PASS.

## Supabase advisor notes
- RLS is enabled across the audited public tables.
- `gamification_settings` intentionally has RLS enabled without a direct policy because it is not directly referenced by the frontend; access should remain through controlled functions.
- Supabase continues to flag exposed SECURITY DEFINER functions. These are a mixture of intentionally public user operations and admin APIs protected by internal authorization guards; blanket revocation would break the admin UI.
- Leaked-password protection remains a Supabase Auth project setting and is not exposed by the available database migration interface; it should be enabled in the Supabase Auth dashboard before production launch.
