# SPIKE Messages V1 — Inspection and Fix Report

Date: 2026-11-24
Source package: `SPIKE_CLOUDFLARE_ROOT_READY.zip`
Supabase project: `Spikemediachat` (`veagqanfilmbchlvlpcc`)

## Scope inspected

- `messages.html` and `message.html`
- `js/spike-messages.js`
- `js/spike-media-routing.js` and `js/spike-cloudinary-storage.js`
- `css/spike-messages.css`
- referenced local page assets
- Supabase tables, constraints, RLS policies, Storage bucket/policies, Realtime publication, project advisors, and recent logs

## Verified baseline

- Both HTML pages have unique IDs and all referenced local assets exist.
- No byte-identical duplicate HTML/CSS/JS source files were found in the archive.
- Both pages use the same single messages runtime; conversation attachments are handled by the existing `spike-media-routing.js` module using the private Supabase `chat-attachments` bucket.
- `messages`, `conversation_members`, and `message_reactions` are in the `supabase_realtime` publication.
- The `chat-attachments` bucket is private, has a 50 MiB limit, and its configured MIME types match the supported private upload formats.
- Message, conversation, member, reaction, and Storage policies scope access to authenticated conversation members/owners.
- Recent production logs show successful message reads, read-receipt updates, and a successful Realtime WebSocket upgrade.

## Production defect found and corrected

The Delete Message action was failing with HTTP 403. Postgres logs identified the exact cause: `authenticated` had SELECT privilege on `public.messages` but no UPDATE privilege. The row-level ownership policy already limited updates to the sender, but the table privilege blocked the operation before RLS could authorize it.

Applied the least-privilege database grant:

```sql
GRANT UPDATE (deleted_at) ON TABLE public.messages TO authenticated;
```

This grants update access only to the soft-delete timestamp column, not to message body, sender, conversation, attachment, or other fields. Existing RLS ownership and MFA policies remain in force.

A transaction-scoped test executed the same soft-delete UPDATE under the `authenticated` role with the logged-in sender identity and returned the expected message ID. The transaction was rolled back, so the test did not alter the user's message.

## Code fixes

- Inbox now refreshes when a message is edited or deleted, not only when a new message arrives.
- Older-message pagination now uses a stable `(created_at, id)` cursor so equal timestamps do not cause skipped records.
- Older-page rendering avoids duplicate message rows and avoids repeating a day divider at the page boundary.
- Appending a live message now inserts a day divider when the calendar day changes.
- Full thread reload clears the message lookup map so deleted/updated rows do not remain as stale menu targets.
- Failed live-message rendering falls back to a thread reload and still attempts to update the read receipt.
- Presence fallback polling and event listeners are cleaned up on page exit.
- Removed the unused Cloudinary uploader script from `message.html`; private chat attachments continue to use Supabase Storage through `spike-media-routing.js`.
- Bumped the messages runtime query version on both pages to prevent stale browser caching.

## Tests

- JavaScript syntax checks: `spike-messages.js` and `spike-media-routing.js` passed.
- HTML/local asset smoke checks: passed.
- Duplicate IDs: none on either page.
- Identical duplicate HTML/CSS/JS files: none found.
- Added `tests/messages-pages-smoke.mjs` for repeatable checks.

## Known limits / not claimed

- No authenticated browser session was available for a full interactive two-account test of message send, incoming delivery, typing, presence, reactions, attachments, and read receipts.
- No live Cloudflare deployment was performed from this package.
- The Supabase security advisor also reports 42 SECURITY DEFINER RPC warnings across the wider SPIKE project and disabled leaked-password protection. Those findings are outside these two messaging pages; they require a separate function-by-function authorization review and Auth settings review. They were not weakened or changed as part of this page repair.
- Therefore this report does not claim universal 100% production functionality; it records the checks actually completed and the remaining live test boundary.
