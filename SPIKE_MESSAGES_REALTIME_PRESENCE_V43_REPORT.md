# SPIKE v43 — Messages Inbox Real-Time Presence Fix

## Changes
- Added a visible presence dot and status/timestamp line to every conversation in `messages.html`.
- Connected the inbox to the shared `AppPresence` runtime and registered conversation partner IDs with `AppPresence.watch(...)`.
- Presence labels now show `Online · [time]`, `Last seen [date/time]`, or `Offline`; the shared runtime updates the DOM when presence events arrive.
- Bumped the shared presence cache version to `sitewide-presence-v4` on `messages.html`.

## Validation
- `messages.html` inline JavaScript syntax check: passed.
- Project check suite: 429 passed, 1 failed, 1 skipped. The single failure is the existing protected-baseline audit, which reports hash mismatches across multiple untouched HTML pages (including admin, feed, friends, guide, help, and others). No baseline entries were rewritten to hide those mismatches.
- No live two-account browser/device session was available, so actual Supabase presence delivery remains to be confirmed in a deployed environment.
