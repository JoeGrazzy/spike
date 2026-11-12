# SPIKE Audit Pass 11 — Premium Neon Red Contrast Hardening

## Scope
A focused source-level accessibility pass on Theme 3 (Premium Neon Red). This pass does not claim a full browser visual audit.

## Changes
- Darkened the bright end of the primary action gradient from `#ff244f` to `#d81742` so white button text maintains WCAG AA contrast at both gradient endpoints.
- Changed text selection foreground to near-black (`#08070b`) over the vivid neon-red selection background.
- Added Theme 3-specific outgoing message bubble styling using dark-red endpoints, preserving white text contrast without removing the brighter neon-red accent from decorative elements.
- Added automated contrast checks using the WCAG relative-luminance calculation, plus source contracts for selection, outgoing bubbles, and focus indicators.
- No HTML, messaging runtime, database schema, or migrations were changed.

## Verification
- `npm run check`: passed.
- Tests: 501 discovered, 500 passed, 0 failed, 1 skipped.
- The new tests calculate contrast ratios for both primary action endpoints, selection colors, and outgoing-message bubble endpoint. Ratios are at least 4.5:1 for the tested text/background pairs.
- Browser screenshots, computed styles, keyboard testing on real devices, and production deployment were not performed.

## Remaining work
The next step is a browser-based visual and accessibility audit across mobile and desktop, including forms, dialogs, menus, hover/focus/disabled states, and all three themes. Static source tests cannot prove actual rendered contrast where later CSS overrides, transparency, images, or runtime styles alter the final colors.
