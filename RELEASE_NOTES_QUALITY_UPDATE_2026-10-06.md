# SPIKE Quality Update — 2026-10-06

## Scope

Quality-first maintenance for the existing SPIKE source package. The original uploaded `SPIKE.zip` remains untouched; this is a separate additive update package.

## Changes in this package

- Restored local source for `supabase/functions/spike-webauthn/index.ts` and `supabase/functions/admin-register-user/index.ts` based on the active SPIKE Supabase project's deployed function sources. The uploaded ZIP had only their function configuration files despite active remote deployments. No function was deployed or changed remotely.
- Replaced stale reaction-v4 assertions with checks for the actual reaction-v5 cache/runtime contract. The existing v5-specific regression tests remain enabled.
- Added a protected-baseline drift report without rewriting the historical baseline manifest.
- Added this release note and `PROJECT_BUILD_NEXT.txt` to label the separate update package. Protected package metadata and protected audit files were left intact.

## Verification

Latest full check: 374 passed, 5 failed, 1 skipped (380 total). The five failures are the four fixture-classification checks and the pre-existing protected-baseline mismatch; these remain visible rather than being suppressed. JavaScript/inline-script typecheck passed (104 JS files + 127 inline script blocks); static audit passed; production build generated 33 HTML pages; Cloudflare artifact verification passed; focused reaction, Safety Center, and voice-note regression tests passed 21/21.

## Known release blockers / limits

- The historical protected baseline manifest originates from `SPIKE_PROJECT_BEAUTIFUL_2026-09-22`; 43 listed files already have a different size/hash in the uploaded source archive. None of the 235 manifest files are missing. The manifest was deliberately not regenerated because the semantic diff has not been fully reviewed. See `PROTECTED_BASELINE_DRIFT_2026-10-06.md` and `.json`.
- Four existing audit checks classify `bridge-harness.html` (a test fixture) as a production page and fail its navigation/safe-area/UI contracts. Protected audit files were not edited to silence these checks. A fifth failure is the pre-existing protected-baseline mismatch above.
- Browser-based visual/accessibility testing could not be completed in this environment. The optional WCAG browser audit is skipped when Playwright dependencies/browsers are unavailable; a headless Chromium attempt previously timed out in this environment.
- No production Supabase migrations, RLS policies, triggers, storage policies, RPCs, or Edge Functions were modified or deployed. Live function and migration inventory was read-only.
- Static source tests do not prove successful live microphone recording, passkey ceremony, or authenticated backend operations on a real device.
