# SPIKE Theme Control V2 — Trace Report

## Protected baseline
This package is a new derivative of the protected SPIKE theme-control package. The protected baseline was not modified in place.

## Root cause found in retrace
The previous `css/spike-theme-final-authority-v1.css` was not actually the final stylesheet on many pages. `css/spike-global-page-authority-v2.css` was loaded after it, and some pages had additional page-local layers after the theme authority. In addition, legacy component namespaces (`--spx-*`, `--g-*`, `--edu-*`, `--live-*`, `--pb-*`, `--chat-*`, `--spn-*`, and generic `--panel/--solid/--surface/--a` tokens) were not all mapped to the canonical `--spike-*` palette.

## Trace
`theme.js` -> `html[data-spike-style]` -> canonical `--spike-*` variables in `theme.css` -> legacy token bridge -> component CSS -> rendered surfaces/text/actions.

`theme.js` emits `spike:theme-change` and persists `spike-feed-style`. CSS consumers do not need a separate JS listener when they consume the canonical CSS variables; the variables update immediately when the root data attribute changes.

## Fix
Added `css/spike-theme-runtime-v2.css` and loaded it after `spike-global-page-authority-v2.css` on every page that loads the canonical theme engine. The runtime maps the remaining legacy component token namespaces to canonical theme variables and provides final selectors for historically hard-coded feature/overlay/message surfaces.

Added `js/audit/tests/theme-runtime-v2.test.mjs` covering token mapping, page ordering, ten-theme registry, and Theme Experience V3 variable coverage.

## Verification
Focused V2 theme tests: 4/4 passed.

Full audit in this derivative: 356 passed, 10 failed, 1 skipped. The ten failures are pre-existing baseline/environment/protected-contract failures and are not presented as clean. The protected-baseline hash test necessarily reports changes because this derivative intentionally contains new theme files/page links.

Live device/browser computed-style verification is not available in this environment because Playwright/browser dependencies are not installed. Therefore no claim is made that every physical-device pixel has been visually verified.
