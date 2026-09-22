# SPIKE Power Fixes — 2026-09-22

## Fixed
- Added the missing `spike-webauthn` Supabase Edge Function with registration/authentication verification, origin/RP-ID checks, expiring one-time challenges, and attempt rate limiting.
- Added pinned Edge Function dependencies for SimpleWebAuthn and Supabase JS.
- Added `package.json` with audit/syntax scripts.
- Added production `dist/feed.html`.
- Split the oversized Feed runtime into bounded JS assets while preserving execution order and the ranking contract.
- Added the canonical mobile safe-area stylesheet to every production HTML page and ensured `viewport-fit=cover`.
- Restored shared navigation loading on every production HTML page.
- Fixed the missing coffee avatar asset reference.
- Completed the theme-browser fixture contract (title, language, bootstrap, theme engine, navigation).

## WebAuthn deployment configuration
The deployed function intentionally requires these server secrets before passkeys can operate:

- `SPIKE_WEBAUTHN_ORIGINS` — comma-separated exact HTTPS origins allowed to perform WebAuthn ceremonies.
- `SPIKE_WEBAUTHN_RP_ID` — WebAuthn relying-party ID, normally the production hostname without scheme/path.
- `SPIKE_WEBAUTHN_RP_NAME` — optional display name; defaults to `SPIKE`.

The function remains JWT-protected and rejects requests from origins not in the allow-list.

## Verification
- Audit suite: **205 passed, 0 failed, 1 skipped**.
- The skipped test is the optional live WCAG browser audit because its Playwright dependencies/browsers are not installed in this bundle.
