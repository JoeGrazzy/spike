# SPIKE Theme Control Trace — V1

## Baseline
Derived from `SPIKE-message-options-contrast-v1-1-menu-polish-v1-2`.
The baseline was not modified.

## Root cause
SPIKE had a canonical 10-theme engine (`js/theme.js` + `css/theme.css`) but several older visual systems did not consume the canonical tokens.

The main traced leaks were:

1. `css/spike-beauty-v1.css` defined its own fixed `--spk-*` palette, so components using those tokens stayed on the old dark palette after a user selected a different theme.
2. `css/spike-unified-v2.css` defined a second `--sp-*` palette, creating another independent visual authority.
3. `message.html`/`messages.html` retained the legacy `--solid:#fff` page token, allowing controls that still referenced `--solid` to escape the active theme.
4. Some page-local selectors used hard-coded dark/white backgrounds with `!important`, outranking the generic shared theme layer.
5. `meta[name="theme-color"]` remained hard-coded, so browser chrome could disagree with the selected theme.

## Fix
A single final stylesheet, `css/spike-theme-final-authority-v1.css`, is loaded immediately after `css/theme.css` on every page that uses the canonical theme layer.

It:

- redirects legacy `--spk-*` and `--sp-*` aliases to canonical `--spike-*` tokens;
- redirects `--solid` to `--spike-surface`;
- makes shared headers, cards, panels, forms, navigation, message surfaces, feature surfaces, and message options consume canonical theme variables;
- overrides known fixed dark/white page-local authorities without changing geometry;
- preserves neutral media stages such as call video surfaces;
- keeps all 10 theme identities defined only by the canonical theme engine.

`js/theme.js` now also synchronizes `meta[name="theme-color"]` with the active `--spike-bg`.

## Tests
Targeted theme/message regression: 17/17 passed.

Full existing project audit on this derivative: 351 passed, 10 failed, 1 skipped. The failures are existing baseline/environment issues (safe-area/navigation expectations, reaction tests, protected-baseline hash checks, safety-center fixture availability, and bridge-harness contract); they are not claimed as fixed by this theme change.

Live browser/device rendering was not available in this environment, so final computed-style verification on a physical Android device remains required.
