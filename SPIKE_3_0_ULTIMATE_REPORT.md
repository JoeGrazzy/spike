# SPIKE 3.0 Ultimate — implementation and verification report

## Scope and approach
The source tree was audited before implementation. The project already contains a broad feature set, including a three-theme system, Settings and profile editor, Safety Center, room/community pages and moderation, polls, real-time direct messages, typing indicators, read receipts, voice notes, attachment sharing, notifications, and a substantial migration/test suite. These existing features were reused rather than recreated.

## Implemented in this pass

### Smart Inbox
- Added a **Pinned** inbox filter and per-conversation pin/unpin controls.
- Pinned conversations sort before other non-archived conversations.
- Added additive migration `supabase/migrations/20261013100000_spike_inbox_preferences_v1.sql` for per-user pin/archive state, with a composite primary key, self-conversation guard, useful partial indexes, authenticated grants, and row-level security policies that restrict reads/writes/deletes to the owner.
- Inbox reads and writes the preference table when the migration is installed. If it is unavailable, local storage remains a fallback and the interface explains that cross-device sync is not available yet.
- The conversation archive action now attempts to sync the archive preference while retaining local fallback.

### Adaptive light/dark appearance
- Modern Mineral (theme 2) now supports Light, Dark, and **Use device setting**.
- The theme runtime listens for operating-system color-scheme changes while System mode is selected.
- Updated page bootstraps to resolve System mode before styles load, reducing a light/dark flash across the app.
- The existing three theme identities remain intact; themes 1 and 3 remain dark-oriented.

### Resilient messaging
- Direct-message drafts are saved per signed-in user and recipient on the current device and restored when reopening that conversation.
- Failed sends preserve the text and explain that the user can retry.
- An offline status appears when the browser reports no connection; drafts remain local and no message is silently auto-sent on reconnect.

### Trust Center and community spaces
- Settings now provides a clearer Trust Center & Safety entry point to the existing Safety Center.
- Existing Safety Center, Rooms, room member management/moderation, and poll infrastructure were retained. No duplicate community or safety subsystem was introduced.

## Verification
- `npm run check`: **524 tests discovered; 523 passed; 0 failed; 1 skipped**.
- `node inline-check.js`: passed.
- `node --check` for every JavaScript file under `js/`: passed.
- Static local-reference audit: **22 HTML pages, 655 local references checked, 0 missing references**.
- Migration version uniqueness and existing migration integrity are included in the passing automated suite.

## Required deployment step
Apply the new migration to the intended Supabase project before expecting inbox pins and archive state to sync across devices:

`supabase/migrations/20261013100000_spike_inbox_preferences_v1.sql`

The migration has been statically reviewed but was **not** executed against a live Supabase database in this environment. Deploy through the project's normal migration process and test authenticated SELECT/INSERT/UPDATE/DELETE with two separate user accounts before production release.

## Honest limitations / not claimed complete
- No live Supabase project was connected. Real database policy behavior, MFA, Realtime delivery, storage permissions, and account-specific flows were not live-tested.
- There was no real mobile-browser visual QA run in this pass. Automated source-level checks are not a substitute for device testing.
- Drafts are stored in browser local storage on the current device; they are not end-to-end encrypted or synced. This is draft recovery, not a durable server-side offline outbox.
- The app does not automatically send queued messages after reconnect; users remain in control and must retry.
- System-matched light/dark mode applies to Modern Mineral (theme 2); the other two theme identities remain as designed.
- Existing Safety Center and community features were integrated/reused, not rewritten. Their existing limitations remain.
- Full end-to-end encryption, scheduled server-side delivery, production AI/translation providers, server-side backup/restore, push notification delivery, and a complete active-session revocation service were not implemented in this pass because they require additional key-management design, provider credentials, workers, or live auth configuration. No UI-only mock is presented as a completed backend feature.
- One existing optional test remains skipped because its browser-test dependency is unavailable.

## Files of particular interest
- `messages.html`
- `message.html`
- `settings.html`
- `js/theme.js`
- `supabase/migrations/20261013100000_spike_inbox_preferences_v1.sql`
- `js/audit/tests/spike-3-ultimate-foundation.test.mjs`
