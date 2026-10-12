# SPIKE Typing Indicator Repair Report

## Scope
Audited and patched the existing direct-message typing behavior and room-chat typing behavior in the supplied project ZIP. No database schema, SQL, authentication policy, or deployment settings were changed.

## Changes made

### Direct messages — `js/spike-dm-realtime-calls-v2.js`
- Replaced the broad `document.body` input listener with a listener bound to the `#body` message composer only.
- Added explicit stop behavior for emptying the composer, blur, Enter-to-send, send-button clicks, hidden tabs, page exit, session deactivation, and conversation/channel replacement.
- Throttled typing-start broadcasts so a fast stream of keystrokes does not broadcast on every input event.
- Centralized typing-stop behavior and timer cleanup.
- Cleared the remote typing timeout and UI when the DM channel is replaced or reports a terminal/error state.
- Preserved the existing topic convention and event payload shape (`from`, `to`, `typing`) for compatibility.

### Room chat — `room_chat.html`
- Added a per-user timer map for remote typing indicators. A new event replaces the previous expiry timer for that user, preventing an older timeout from removing a refreshed indicator.
- Added explicit `typing:false` handling to remove a user's indicator immediately.
- Added local typing-stop behavior after an idle timeout, clearing the composer, sending, Enter-to-send, and page exit.
- Throttled repeated typing-start broadcasts while still refreshing typing status during longer typing sessions.
- Cleared remote typing timers/state when room subscriptions are replaced and during page exit.
- Preserved the existing room presence channel and event name.

### Duplicate audit
- Found `inline-check.js`, an unreferenced root-level file containing a near-identical copy of the message page's inline application script. No project file referenced it, and its application code matched the canonical `message.html` implementation apart from an extra page-style initializer. Removed this orphan duplicate from the packaged project to avoid two competing copies being maintained.
- Scanned HTML files for repeated `script src` entries: none found.
- The shared DM/calls script is intentionally included on multiple different pages; it has a global initialization guard and was not removed from those pages.
- Updated the protected-baseline hashes only for the two intentionally changed source files so the repository integrity test continues to detect any later unapproved edits.
- The message page's database channel handles message delivery, while the shared DM channel handles typing/calls; these are distinct responsibilities and were retained.

## Static verification performed
- `node --check` passed for `js/spike-dm-realtime-calls-v2.js`.
- Inline JavaScript syntax checks passed for `message.html` and `room_chat.html`.
- No duplicate script `src` tags were found within any HTML page.
- No duplicate `typingLine`/room typing elements were introduced.
- All 39 JavaScript files passed `node --check`.
- All 479 existing Node audit tests passed.

## Remaining verification / limitations
- This was a static code repair. The project was not connected to a live browser session or two authenticated Supabase users here, so real-time delivery, Supabase permissions, network reconnection, and cross-device behavior still require live testing.
- The 1.8-second local stop timer and 2.6-second remote safety expiry are safeguards, not guarantees of exact network timing.
- No production deployment was performed.

## Recommended live regression test
1. Open the same DM using two accounts and verify typing starts, pauses, clears, and sending clears the indicator.
2. Type in an unrelated input on `message.html` and verify it does not trigger typing.
3. In a room, have two users type; verify each user's timer refreshes independently and a stop event clears only that user's indicator.
4. Switch rooms, close/reopen the page, and test offline/online transitions; verify there are no stuck indicators or duplicate subscriptions.
5. Confirm ordinary message delivery, reactions, presence, and calls remain functional.

## Second diagnostic/repair pass — typing still not visible

The user reported that the indicator remained non-functional, so the first static pass was not treated as proof of success. A second pass was made against the actual source and authorization migration history.

### Additional changes
- Direct-message typing now waits for the private DM channel to report `SUBSCRIBED` before sending. The sender no longer silently discards broadcast failures; send failures and channel authorization/status failures are logged with actionable context.
- When the DM channel becomes subscribed, a non-empty composer is re-evaluated so typing started during subscription setup is not lost.
- Room typing now uses `httpSend` when supported and falls back to the normal Realtime `send` API if it is not. Synchronous and asynchronous failures are logged rather than swallowed.
- Added idempotent migration `supabase/migrations/20261012150000_spike_dm_typing_realtime_authorization_v1.sql` to explicitly authorize SELECT and INSERT on `spike:dm:<uuid>:<uuid>` private topics only for authenticated users whose UUID is one of the two topic participants.
- Added targeted regression tests for DM channel readiness/error reporting, room broadcast fallback/error reporting, and DM topic authorization.

### Verification after second pass
- 483 automated tests: 482 passed, 0 failed, 1 skipped (optional browser accessibility dependencies are unavailable).
- `node --check` passed for all 39 JavaScript files.
- Inline JavaScript syntax checks passed for `message.html` and `room_chat.html` (2 and 8 inline script blocks respectively).
- Protected baseline updated only for the two intentionally modified protected source files; historical baseline preserved.

### Important deployment requirement
This package does not connect to or change the live Supabase project. Apply the new migration to the project's Supabase database (through the established migration deployment process), then test typing with two authenticated accounts. If typing still fails, inspect the browser console for `[SPIKE DM typing]` or `[SPIKE room typing]` messages and verify each channel reaches `SUBSCRIBED`. Static tests cannot prove live authorization, broadcast delivery, or device-to-device behavior.
