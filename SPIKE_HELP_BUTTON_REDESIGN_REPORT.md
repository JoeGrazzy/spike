# SPIKE 3.0 Help Button Placement Redesign

## Status
Implemented in source and packaged for review. No production deployment or Supabase changes were made.

## User problem
Users reported that the floating Help control covered the Feed and requested a better position and a more useful Help experience.

## Changes
- Removed creation of the fixed floating Help button from the optional onboarding runtime.
- Disabled the legacy floating-button style as a defensive fallback.
- Added a Help Center navigation entry and a Replay Tutorial entry to the existing Feed command menu's Account & Support section.
- On pages without that command menu, added an in-flow Help link to the existing header actions rather than a fixed overlay.
- On the Help Center page, added a Replay Tutorial header control.
- Added shared styling for the new navigation/header entries and applied it to all 14 pages that load onboarding.
- Bumped the onboarding script cache version to v=2.
- Added regression tests for the non-floating placement and page coverage.

## Verification
- `node --check js/spike-onboarding-v1.js`: passed.
- `npm run check`: passed — 567 passed, 0 failed, 1 skipped (568 total).
- ZIP integrity check: passed.

## Scope and limitations
- The source was updated; this is not deployed to production.
- The optional Supabase onboarding migration remains unapplied, as before.
- Browser-level visual verification on real mobile/desktop viewports remains outstanding. Automated tests verify source contracts, not rendered appearance.
- Existing tutorial behavior, Help Center page, theme system, and unrelated app features were preserved.

## Main files changed
- `js/spike-onboarding-v1.js`
- `css/spike-onboarding-v1.css`
- `css/spike-onboarding-help-placement-v2.css` (new)
- The 14 HTML pages that load the onboarding module
- `js/audit/tests/onboarding-contract.test.mjs`
- `js/audit/tests/help-placement-v2.test.mjs` (new)
