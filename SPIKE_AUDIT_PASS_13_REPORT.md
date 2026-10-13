# SPIKE Audit — Pass 13: Modern Mineral Theme 2

## Objective
Refresh Theme 2 with a new, calm color family and support both light and dark appearances without changing the stable theme ID or disturbing Themes 1 and 3.

## Changes
- Renamed Theme 2 to **Modern Mineral** in the central theme registry and Settings selector.
- Replaced the previous sapphire palette with a fresh mineral-white / evergreen text / jade accent light palette.
- Added a matching deep evergreen dark palette with mint-jade accents.
- Added a Settings appearance selector for Theme 2: Light or Dark. It is shown only when Theme 2 is selected.
- Persisted the selected Theme 2 mode in `localStorage` under `spike-theme-2-mode`; the shared theme runtime applies the choice across pages and responds to storage changes from other tabs.
- Preserved Theme 2's numeric ID (`2`), Theme 1's palette, Premium Neon Red's palette, and the protected messaging runtime.
- Updated regression tests for the new palette, mode switch, and contrast requirements.

## Verification
- `npm run check`: **504 tests discovered; 503 passed; 0 failed; 1 skipped**.
- `node --check js/theme.js`: passed.
- `node inline-check.js`: passed (exit code 0).

## Scope and limitations
This is a source-level implementation with automated checks. It has not been visually inspected in a real browser/device, tested with live accounts, or deployed to production. The one skipped test is an optional browser-related test whose environment prerequisites are unavailable. The mode preference is device/browser-local; it is not synchronized to the account database.
