# SPIKE — New Ownership Handoff

This folder is the portable frontend source package for SPIKE. Start with `BACKEND_STATUS.md`; it lists what is and is not included and the work required before production.

## Included
- Static HTML pages
- CSS and browser-side JavaScript
- Images, icons, fonts, and notification sound
- Existing messaging/voice-note integrity test
- Static hosting configuration (`wrangler.jsonc`)

## Not included
- Backend/database/authentication or production data
- Supabase, Agora, or LiveKit credentials/configuration
- Cloud provider account ownership, domains, DNS, signing keys, billing, or app-store accounts

## First steps for the new owner
1. Put this source under a new organization-owned Git repository.
2. Configure hosting under the new owner's account and domain.
3. Configure official support contacts and the public share URL.
4. Select and implement a replacement backend, then reconnect and test each server-backed feature.
5. Complete the security, privacy, legal, and release checklist in `BACKEND_STATUS.md`.

Do not deploy this frontend as a functioning social application until backend-dependent flows have been integrated and verified.

## Source checks
Run `npm run check` with Node.js installed. This performs JavaScript syntax checks and the included source-integrity/regression tests. It does not require third-party npm packages.
See `SOURCE_STRUCTURE.md` for the asset naming and maintenance conventions.
