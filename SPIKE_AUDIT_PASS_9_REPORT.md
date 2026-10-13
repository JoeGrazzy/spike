# SPIKE Audit Pass 9 — Premium Neon Red Theme

## Goal
Convert Theme 3 from the previous light blue/purple palette into **Premium Neon Red**, preserving Themes 1 and 2 and keeping the existing shared layout and control geometry.

## Changes
- Replaced Theme 3 palette tokens in `css/spike-three-theme-authority.css` with a dark charcoal/black foundation, vivid neon-red accent (`#ff244f`), pink-red highlight (`#ff6688`), muted rose text, red-tinted borders, and subtle atmospheric background gradients.
- Added restrained red glow treatment for shared headers/navigation, cards, active selections, and primary actions. The theme avoids broad neon glow on every element to keep text and controls readable.
- Updated the theme registry in `js/theme.js` to identify Theme 3 as `Premium Neon Red` and declare dark mode.
- Updated the Settings selector label in `settings.html`.
- Updated all HTML early-theme bootstraps that previously treated only Theme 1 as dark, so Theme 3 starts in dark mode without a light-theme flash.
- Updated palette coverage tests and added dedicated regression tests for the Premium Neon Red palette and early bootstrapping.
- Themes 1 and 2 palette tokens were not changed.

## Verification
- `npm run check`: passed (exit code 0).
- Regression suite: 496 tests discovered; 495 passed, 0 failed, 1 skipped.
- Protected runtime `js/spike-dm-realtime-calls-v2.js` SHA-256 matches Pass 8 exactly: `6c8a58b56ffc9a6d8d5ddb8d9213f186db8d606a2d0e6ff2417e2ce6cd0b9c66`.
- Archive integrity check performed after packaging.

## Limitations
- The one skipped test is the existing optional browser automation test; browser automation is not configured in this environment.
- No live visual check across real devices/browsers, no production deployment, and no live account test were performed. This is a source and automated-regression pass, not a claim of production deployment.

## Design recommendation
Use Premium Neon Red as the bold/expressive option, while retaining Themes 1 and 2 for users who prefer their current appearance. Keep red for primary actions, focus, selected state, and a few accents; use dark neutral surfaces for most of the UI. That gives the app a premium neon identity without reducing legibility or making every panel glow.
