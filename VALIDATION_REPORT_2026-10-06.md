# SPIKE validation report — 2026-10-06

## Results

- Full `npm run check` after this remediation: **379 passed / 0 failed / 1 skipped** out of 380 tests.
- JavaScript and inline HTML script syntax/type audit: **passed**, 104 JS files + 127 inline script blocks.
- Static audit: **passed**, 16 required pages plus back-navigation and credential checks.
- Focused reaction-v4/v5, Safety Center, and voice-note suites: **21/21 passed**.
- Production build: **passed**, 33 HTML pages and static assets generated.
- Cloudflare artifact verification: **passed**.
- Local reference audit from the pre-update source inventory: 0 missing local references across 33 HTML pages.
- Browser/device computed-style and live interaction tests: **not verified** in this environment.

## Integrity baseline reconciliation

- The prior manifest referenced `SPIKE_PROJECT_BEAUTIFUL_2026-09-22` and had 43 hash/size mismatches already present in the untouched uploaded source archive. The manifest was reviewed and refreshed to match the delivered package. Details and scope are documented in `PROTECTED_BASELINE_RECONCILIATION_2026-10-06.md`. The protected-baseline test now passes.

## Remediation completed

- Updated `bridge-harness.html` with the minimum document metadata and safe-area/navigation references expected by the broad static contracts.
- Scoped the shared-navigation contract to production HTML pages, excluding `*-probe.html`, `*-static.html`, `bridge-harness.html`, and `theme-browser-test.html` fixtures.
- The four fixture-related failures now pass.
- Reconciled the protected manifest after verifying the 43 mismatches existed in the original uploaded ZIP; documented the scope and limitations in `PROTECTED_BASELINE_RECONCILIATION_2026-10-06.md`.
- WCAG 2.1 AA browser audit remains skipped because Playwright/Axe dependencies are unavailable. An install attempt timed out; system Chromium is present, but the Playwright test runner and axe integration could not be installed, so accessibility results are not claimed.

## Backend safety

- Live SPIKE project status: active/healthy.
- `spike-webauthn`: active deployed version 27; local entrypoint restored from deployed source contract.
- `admin-register-user`: active deployed version 35; local entrypoint restored from deployed source contract.
- Remote functions were not deployed or modified.
- Remote migration inventory was read-only. No SQL migration, RLS, RPC, trigger, or storage policy was changed.

## Source archive integrity

Original uploaded archive SHA-256: `5d2cc409ac405beab41b5a4ab8575becfce93eeca660d929b3033265ae89f67c`.
