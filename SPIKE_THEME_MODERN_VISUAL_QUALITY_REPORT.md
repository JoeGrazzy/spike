# SPIKE — Deep Theme Visual Quality Audit and Modernization

**Date:** 2026-10-23  
**Scope:** Five active themes, shared theme cascade, component-level styling contracts, palette contrast, and automated source checks.

## Executive summary

The product already has a centralized three-theme registry and palette authority, but its visual language had accumulated across several CSS layers. The biggest safe opportunity was not to replace the themes with unrelated redesigns: it was to make the shared surfaces, type hierarchy, form controls, interaction states, and accessibility behavior feel like one coherent modern product while preserving each theme's character.

This pass implements that shared quality layer and fixes a measurable contrast issue in Theme 2's primary-action gradients. It does not change theme IDs, database encoding, page layouts, navigation, or business logic.

## Current theme identities

| Theme | Existing visual direction | Intended product feel | Quality focus |
|---|---|---|---|
| Theme 1 | Deep graphite, warm amber, copper actions | Calm, warm, premium dark UI | Preserve warmth without making every surface glow; maintain clear muted-text hierarchy |
| Theme 2 | Mineral light surfaces and evergreen dark mode with jade accents | Clean, calm, broadly usable default | Clear separation between background, cards, controls, and selected states; both light and dark modes need contrast-safe actions |
| Premium Neon Red | Near-black surfaces, vivid red accents, subtle atmospheric glow | Expressive, high-energy dark UI | Keep the signature red, but use glow selectively so content remains readable and the interface does not feel noisy |

## Deep audit findings

1. **Theme layers overlap by design.** `theme.css`, `spike-theme-experience-v3.css`, `spike-theme-final-authority-v1.css`, `spike-theme-runtime-v3.css`, and `spike-three-theme-authority.css` jointly define defaults, compatibility aliases, page/component behavior, and palette authority. Removing or merging these layers without computed-style comparisons could silently break page-specific consumers.
2. **Shared components needed stronger consistency.** Cards, dialogs, fields, tabs, rows, and navigation are styled by a broad range of older and page-specific rules. A final shared finish is a safer first step than a destructive consolidation.
3. **Theme 2 light-mode action contrast had a near miss.** White text over `#0b8877` was approximately **4.37:1**, below the WCAG AA 4.5:1 target for normal text. Theme 2 dark mode's white text over `#13a18a` was approximately **3.23:1**, clearly below target.
4. **Theme 3 could retain its identity with less constant glow.** Bright red remains in the accent, selection, focus, and active-state system; default content cards now use quieter shadows so emphasis is more intentional.
5. **Keyboard, motion, and tap comfort should be consistent across themes.** The new shared rules reinforce visible focus, a 44px minimum height for standard text/select controls, and reduced-motion handling without resizing checkbox/radio/range/color controls or icon-only buttons.
6. **A source audit is not the same as visual regression testing.** Static tests can protect tokens, contrast, and CSS contracts, but real screenshots/computed styles are still needed on representative pages at desktop and mobile sizes.

## Changes implemented

- Added modern shared design tokens for small/large radii, control height, motion timing/easing, selected/hover surfaces, and card shadows.
- Improved font rendering and heading/body rhythm without introducing a new font dependency or changing page geometry.
- Standardized card-like surface finish, borders, menu/dialog elevation, input focus, and common active/hover states.
- Made the focus ring explicit for keyboard users and respected `prefers-reduced-motion` across the shared layer.
- Reduced always-on neon card glow in Premium Neon Red while preserving the vivid accent and dark identity.
- Changed Theme 2 light action gradient end from `#0b8877` to `#0b786b`, and dark-mode endpoint from `#13a18a` to `#0b806f`.
- Updated Theme 1's internal signature metadata from “pending” to its actual warm graphite/amber palette description; the stable public theme ID and label remain unchanged.
- Added `js/audit/tests/theme-modern-visual-quality-v1.test.mjs` to protect the new visual contracts and action contrast.

## Contrast measurements

Ratios below were calculated from the current solid palette tokens using the WCAG relative-luminance formula. They are not a claim that every composited component or image overlay has been audited.

| Palette | Main text vs. page background | Muted text vs. page background | White/action text vs. action gradient endpoints |
|---|---:|---:|---:|
| Theme 1 | 17.34:1 | 10.83:1 | 7.20:1 / 10.00:1 |
| Theme 2 light | 13.95:1 | 5.61:1 | 6.58:1 / 5.37:1 |
| Theme 2 dark | 16.39:1 | 10.18:1 | 4.91:1 / 4.85:1 |
| Premium Neon Red | 18.68:1 | 9.37:1 | 6.13:1 / 5.10:1 |

The Theme 2 dark action endpoints are now above the 4.5:1 AA target, but with less headroom than the other themes; keep this in the next visual/accessibility review.

## Verification

- `npm run syntax`: **passed**.
- Focused theme modernization tests: **3 passed, 0 failed**.
- Full `npm test`: **533 passed, 5 failed, 1 skipped** out of 539 tests. The same five failures were present in the pre-change baseline (**530 passed, 5 failed, 1 skipped** out of 536 tests), so this pass introduced no new failing test. Existing failures concern missing Edge Function source files in the supplied archive (including `admin-user-ops`, `admin-register-user`, and `spike-webauthn`) and a protected-baseline check that expects those omitted files.
- Automated headless screenshot capture did not complete in this environment; therefore no claim is made that browser visual regression has passed.

## Recommended next step

Run a deliberate screenshot/computed-style review for the feed, profile, settings, inbox/message, rooms, and admin pages in all five theme modes at mobile and desktop widths. Focus especially on page-local hard-coded colors, contrast over media/gradients, long labels, dense data tables, sticky navigation, modal stacking, and text fields. Only after those comparisons should the overlapping legacy CSS layers be consolidated.
