# SPIKE Three-Theme System — neutral scaffold

The legacy ten-theme palette registry has been removed from active theme selection. Exactly three theme IDs are supported: `1`, `2`, and `3`. The current palette identities are Warm Graphite (Theme 1), Modern Mineral (Theme 2, light/dark capable), and Premium Neon Red (Theme 3). The public selector keeps stable Theme 1/Theme 2 labels and the existing Premium Neon Red label; the signature metadata documents the visual direction without changing stored IDs.

- `js/theme.js` is the active registry and browser preference authority.
- `css/spike-three-theme-authority.css` currently provides a temporary palette scaffold for IDs 1–3, not final approved design.
- The browser preference key is `spike-theme-choice-v3`. Known older browser preference keys are removed when the new code loads.
- The existing database field is `user_app_settings.theme_style`; supported values are 1–3.
- `supabase/migrations/202610120001_reset_legacy_theme_preferences.sql` resets stored theme preferences to ID 1 so an old selection is not silently reinterpreted. This migration has **not** been applied to a live database and requires deployment approval.

Theme selection is limited to three choices. This is a source-package audit; it does not establish that a live deployment, browser cache, CDN copy, or production database has been updated.


## Modern visual quality pass — 2026-10-23

- Added a shared visual-quality layer at the end of `css/spike-three-theme-authority.css`; it does not create additional theme IDs or alter page structure.
- Standardized typography rendering and heading rhythm, shared surface geometry/shadows, hover/active states, focus treatment, field sizing, selected states, and reduced-motion behavior.
- Kept the Premium Neon Red theme distinctive while reducing default card glow so attention is reserved for active controls.
- Corrected Theme 2's two primary-action gradient endpoints in both light and dark modes so white action text meets WCAG AA contrast (4.5:1) at each endpoint.
- Added `js/audit/tests/theme-modern-visual-quality-v1.test.mjs` to guard shared tokens, consistent geometry, reduced motion, and primary-action contrast.
- Contrast checks in this pass cover solid palette/action colors only; they do not certify every page-specific overlay, media composition, or live browser rendering.
