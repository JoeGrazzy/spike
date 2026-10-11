# SPIKE v42 — Message and Presence Timestamps

## Changes
- Direct-message bubbles display both date and local time, rather than time only.
- Inbox conversation rows retain their date/time stamp for the latest message.
- Shared real-time presence indicators display `Online · just now`, a recent heartbeat time, or `Last seen ...` when a user goes offline.
- Presence payloads now include both a millisecond timestamp and ISO `updated_at` value; observers use the latest tracked timestamp where available.
- Inbox presence indicators include readable status text alongside the online dot.
- Bumped shared script cache keys to avoid clients continuing to run the previous timestamp-less runtime.
- Updated the protected baseline manifest to record the intentional reviewed change to `js/presence.js`.

## Verification
- `node --check` passed for the shared presence and site-wide calls runtimes and extracted inline scripts from message.html/messages.html.
- `npm run check`: 430 passed, 0 failed, 1 skipped (optional browser accessibility audit dependencies unavailable).
- No live browser/device or Supabase Realtime session was available for end-to-end verification.
