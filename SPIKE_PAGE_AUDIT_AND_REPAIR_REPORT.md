# SPIKE Page Audit & Repair Report

## Scope
Reviewed all 22 root HTML pages for page titles/headings, local navigation/resource references, and duplicate static element IDs. Reviewed the Settings and Profile editor save paths and the existing `spike_update_profile_v1` database function before changing responsibilities.

## Issue found and repaired
The profile editor duplicated eight account privacy controls that already existed in `settings.html`: profile, posts, media, and friends visibility; who may message/call; online status; and profile discovery. The two screens could write the same privacy record, which made it unclear where the canonical settings belonged.

### Changes
- `settings.html` is the single home for app preferences, notifications, privacy/access, and account actions.
- Added an **Edit profile** shortcut in Settings that opens the existing profile editor through `profile.html?edit=1`.
- `profile.html` now focuses its editor on identity/profile details (display name, username, bio, avatar, cover, website, location, and social links). Its privacy panel points users to `settings.html#privacy` rather than presenting duplicate controls.
- The existing profile boot sequence opens the editor only after the signed-in user's profile data has loaded and only when the requested profile belongs to that user. It removes the one-time `edit=1` query from the visible URL afterward.
- Profile save continues to pass the privacy fields required by the existing database RPC, but takes those values from the loaded privacy record instead of editor controls.
- If the privacy read failed, profile edits and avatar changes are paused rather than risking writing default privacy values over existing preferences.
- Updated and added automated tests to lock in this page-responsibility boundary and shortcut behavior.

## Navigation and integrity audit
- Root HTML pages checked: **22**.
- Local relative file references checked: **654**.
- Missing local file references: **0**.
- Duplicate static IDs in initial HTML markup: **0**.
- The separate Security & Tools page still links back to Settings; Settings still links to Security & Tools.
- No SQL migrations or live database records were changed.

## Regression verification
- `npm run check`: **519 tests discovered; 518 passed; 0 failed; 1 skipped**.
- `node --check` for all JavaScript files under `js/`: passed.
- `node inline-check.js`: passed.
- Existing protected direct-message realtime and Feed runtime files were not modified; their SHA-256 hashes still match the recorded baseline in `SPIKE_AUDIT_PASS_22_REPORT.md`.

## Limitations
This is a source-level and automated regression audit. The project was not connected to a live Supabase account for testing profile saves, RLS policies, MFA enrollment, Realtime, or browser notifications. A real browser/mobile-device visual pass and the optional accessibility test remain unverified. The one skipped automated test reflects missing browser-test dependencies, not a failed assertion.
