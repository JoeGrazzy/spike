# SPIKE Continued Upgrade — Phase 2 Report

Date: 2026-10-13

## Work completed in this pass

### Direct-message voice-note reliability
- Fixed the voice-note send failure path so a failed send no longer discards the recorded audio.
- The recording tray now offers an explicit **Retry voice note** action after a failure and keeps Cancel available.
- Retries reuse a client-generated message UUID and check for an already-inserted message after an ambiguous insert error, reducing duplicate-message risk when the server committed but the response was lost.
- Added regression tests for recording retention, retry UI, stable IDs, and recovery lookup.
- This is source-level and regression-test coverage only; live Supabase behavior still requires staging verification.


### Accessibility: explicit control names
Added explicit `aria-label` names to controls that previously relied on placeholders, adjacent visual text, or icon-only appearance. Changes cover:
- Settings: 21 preference switches, including content preferences, notification categories, presence, and discovery.
- Profile editor: 11 image/profile/QR controls.
- Feed feature center: 20 custom Feed, poll, series, collaboration, membership, product, and search controls.
- Admin: 15 stable-ID search, announcement, maintenance, recovery, policy, and command controls.
- Security/tools, messaging, and search pages: stable-ID controls where applicable.

These are additive accessibility attributes. No database schema, authentication flow, payment code, message payload format, or runtime API was changed in this pass.

### Regression protection
Added `js/audit/tests/accessibility-labels.test.mjs` to check the Settings switches, Profile editor controls, and Feed feature controls for accessible names. The existing test suite now covers this improvement.

## Verification actually run
- `npm run check`: **528 passed, 0 failed, 1 skipped** (529 tests discovered).
- `node --check` on all 40 JavaScript files: passed.
- `node inline-check.js`: passed.
- Active SQL migrations: 110; archived SQL migrations: 11.
- Static SQL scan reviewed 236 function declarations; no `SECURITY DEFINER` declaration lacking an explicit `SET search_path` was detected by the scan. This is a source-level check, not a substitute for a full policy/privilege review.
- Production HTML pages: 22.
- `node inline-check.js`: passed.
- `node --check` on all JavaScript files: passed.
- Final ZIP archive integrity: verified after packaging.

The skipped test is the optional browser accessibility audit. Automated source tests do not replace a real browser/screen-reader audit.

## Release blockers that remain

1. **Incomplete Edge Function source bundle.** `supabase/edge-function-deployment-manifest.json` lists nine deployed functions. The archive contains source directories for only `admin-register-user`, `admin-user-ops`, and `spike-webauthn`; `spike-predictor-sync` exists only as an edge-function candidate. The source for `create-private-call`, `spike-media-download`, `spike-paystack-init`, `spike-b2-media`, and `spike-paystack-verify` is absent. Do not deploy or reconstruct these from hashes alone.
2. **Payment and media backend review is incomplete** until the exact deployed source and trusted deployment hashes are supplied or retrieved from the authorized Supabase project.
3. **Live verification not performed.** No live Supabase database, RLS, Realtime, storage bucket, payment provider, push delivery, or production deployment was exercised.
4. **WebAuthn challenge consumption needs a protected security review.** The current helper reads a challenge and then deletes it in a separate database operation, and it does not check the delete result. Concurrent verification requests could race around challenge consumption. I deliberately did not change `supabase/functions/spike-webauthn/index.ts` because the repository's protected-baseline test explicitly prevents unreviewed changes to that security-sensitive file. Resolve this through a reviewed atomic consume operation and a dedicated test/baseline update.
5. **Visual accessibility audit remains pending.** The optional browser test is skipped because browser dependencies are unavailable; mobile device and screen-reader behavior are not certified.
6. **Delivery guarantees.** Client-side message drafts and local reminder utilities are not a substitute for server-side scheduled jobs or cross-device synchronization.

## Next phases
- Continue messaging reliability review beyond voice-note sending (attachment failures, realtime reconnect behavior, and duplicate handling for text messages).

- Obtain and hash-verify the missing deployed Edge Function sources.
- Run SQL/RLS policy review and integration tests against a staging Supabase project.
- Install the pinned browser test dependencies and run the accessibility suite plus visual mobile/desktop regression.
- Exercise messaging failure/retry paths, storage authorization, account lifecycle, and payment reconciliation in staging.
- Only then prepare deployment/rollback instructions and mark the release ready.
