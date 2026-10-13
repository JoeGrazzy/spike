# SPIKE Audit Pass 7 — Direct-message typing lifecycle

## Scope

Focused on direct-message typing indicators and cleanup while preserving the protected `js/spike-dm-realtime-calls-v2.js` runtime and database migrations.

## Changes

- Added page-owned typing broadcast handling in `message.html`, using the existing pair-scoped `spike:dm:<sorted-user-ids>` private topic and the existing `{from,to,typing}` payload contract.
- Restricted outgoing typing events to the message composer rather than unrelated page inputs.
- Stop typing when the composer becomes blank, loses focus, or the document becomes hidden.
- Expire the remote indicator after a short timeout and clear its timer/state on channel failure and page exit.
- Preserve the composer's auto-resize behavior while isolating its input event from the global calls module's overly broad body listener.
- Added `js/audit/tests/dm-typing-lifecycle-v1.test.mjs` for the page wiring and cleanup contracts.

## Verification

- Full automated suite: **490 passed, 0 failed, 1 skipped (491 tests discovered)**.
- Protected baseline test: passed; no protected baseline file was modified.
- Inline JavaScript syntax checks for all 3 inline scripts in `message.html`: passed.
- `node --check js/spike-dm-realtime-calls-v2.js`: passed.

## Limitations / not yet verified

- No browser automation or live two-account test was run; the optional Playwright/browser test remains skipped because its dependencies/browser setup are unavailable in this environment.
- No production deployment, database migration, or realtime authorization change was performed.
- This pass addresses the open DM page typing indicator lifecycle only. Inbox typing previews and the broader message read/delivery lifecycle remain separate audit work.
