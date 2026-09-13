# SPIKE Safety Center v5

The Safety Center is loaded from `js/spike-safety-center-v5.js?v=20260912-5`.

## Release guarantees verified by automated tests
- No native `alert()`, `confirm()`, or `prompt()` calls in the Safety Center module.
- No `window.toast()` dependency in the Safety Center module.
- All 15 Safety Center feature surfaces and actions are present.
- Premium SPIKE dialogs are used for confirmations and inputs.
- Existing `app_documents` persistence is used for Safety Center state.
- Safety Code generation is persisted independently of the timeline toggle.
- Trusted Contacts use a premium picker instead of a browser prompt.
- Passkey registration and browser-side credential retrieval are exercised by mocked WebAuthn tests.
- Automation rules are connected to supported safety signals.
- Scam, impersonation, harassment, activity, link, rate, sensitive-data and screen-protection hooks are present.
- Old v4 Safety Center filename is no longer referenced by Feed.

## Scope limitation
Passkey registration/retrieval is a real WebAuthn browser flow, but server-side WebAuthn challenge verification is required before a passkey can be trusted as an account-login or account-recovery credential. Trusted Contacts are a private selection list; no backend recovery-notification workflow is invented because the current project has no such backend contract.

## Production hardening pass — 2026-09-12

- Added server-authoritative Personal Safety Code registration using SHA-256 hashes.
- Added Admin → Safety Recovery Center with server-side code verification and rate limiting.
- Added one-time, 15-minute recovery tokens and integrated `reset-password.html` with the token flow.
- Recovery consumes the token atomically, changes the Auth password server-side, invalidates existing Auth sessions, disables the consumed Safety Code, and removes outstanding recovery tokens.
- Added server-authoritative Trusted Contacts storage and synchronization.
- Added server-side WebAuthn credential registry/challenge tables and `supabase/functions/spike-webauthn` using SimpleWebAuthn for registration/authentication verification.
- Frontend passkey registration/authentication now requires server verification instead of treating browser credential retrieval as sufficient.

### Deployment requirement
The SQL migrations and WebAuthn Edge Function must be deployed to the project's Supabase environment before these server-authoritative paths are live. The static client cannot safely perform the privileged operations itself.
