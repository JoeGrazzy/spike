# SPIKE Inbox Unread Count Badges — V1

## Changes
- Added a numeric unread badge to each conversation row. Counts represent unread incoming messages from that sender, not merely a boolean unread flag.
- Added a total unread-message count badge to the Unread filter chip; it hides when the total is zero and caps its display at `99+`.
- Highlighted conversations that have unread messages while retaining existing preview, timestamp, presence, archive and search behavior.
- Added a paginated unread-message count query, including legacy rows where `read` is null, and excludes deleted messages.
- Refreshes inbox counts on incoming message INSERT events and read-state UPDATE events. Queues a follow-up refresh if multiple realtime updates arrive during an active refresh.
- Added accessibility labels for count badges.
- Updated the protected baseline hash for the intentionally modified `messages.html` and added targeted regression tests.

## Validation
- Inline JavaScript syntax check: passed.
- `npm test`: 486 passed, 0 failed, 1 optional accessibility test skipped.
- ZIP integrity check: to be run on the packaged archive.

## Deployment note
This package is a source update only. It has not been deployed to the live Cloudflare site. Live count accuracy depends on the existing Supabase `private_messages` schema and the authenticated user's SELECT policies allowing them to read their own incoming messages.
