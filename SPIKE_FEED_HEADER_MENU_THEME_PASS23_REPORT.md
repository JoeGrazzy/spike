# SPIKE Feed Header + Menu Theme Audit — Pass 23

## Goal
Make the Feed header, command menu, secondary navigation drawer, notification trigger, and bottom navigation consume the selected Spike theme across Theme 1, Theme 2 Light, Theme 2 Dark, and Theme 3 without changing their interaction logic.

## Root cause found
`feed.html` contained a late inline header-visibility hardening block that forced `Canvas`/`CanvasText` colors. The Feed command menu and smart navigation also had hard-coded purple, navy, and plum surfaces in page-local CSS, while `spike-feed-command-menu-v4.css` included fixed purple accent colors. The bottom navigation had a fixed plum background and active color. Those rules could visually conflict with the central theme palette.

## Changes
- Added `css/spike-feed-header-theme-v1.css`, a Feed-scoped theme consumer loaded after `css/spike-three-theme-authority.css`.
- Normalized the sticky Feed header, brand/title/subtitle, divider, search/menu/notification controls, hover/focus/expanded states, and notification badge to canonical `--spike-*` tokens.
- Normalized the command menu and legacy menu sheet, menu options, menu labels, search row, icon tiles, close button, and focus indicators.
- Normalized the separately rendered `.spike-smart-nav` drawer.
- Replaced the fixed plum bottom navigation palette with the active theme's surface, line, muted text, and accent tokens.
- Kept sign-out styling semantically dangerous, using the theme danger token rather than a theme accent.
- Added `js/audit/tests/feed-header-theme-authority.test.mjs` to enforce stylesheet order, token usage, component coverage, and no palette redefinition.
- No runtime JavaScript, database migrations, authentication, or payment logic was changed.

## Verification
- `npm run check`: passed; 515 tests discovered, 514 passed, 0 failed, 1 skipped.
- `node --check` on every `.js` file under `js/`: passed.
- `node inline-check.js`: passed.
- Protected files preserved byte-for-byte against the Passes 15–22 baseline:
  - `js/spike-dm-realtime-calls-v2.js` SHA-256: `6c8a58b56ffc9a6d8d5ddb8d9213f186db8d606a2d0e6ff2417e2ce6cd0b9c66`
  - `js/feed-runtime-04-2.js` SHA-256: `6e5ce5beabf5fe34d5182e9871fd150685285d5ee56022e668787556f6567703`
- Archive integrity checked after packaging.

## Not verified
A Chromium screenshot attempt for the local Feed page timed out before producing an image. Therefore, this pass is source-level and automated-test verified; browser rendering, actual mobile-device appearance, live account behavior, and production deployment remain unverified. The one skipped automated test remains skipped as indicated by the test runner.

## Files changed
- `feed.html`
- `css/spike-feed-header-theme-v1.css` (new)
- `js/audit/tests/feed-header-theme-authority.test.mjs` (new)
- This report and logs
