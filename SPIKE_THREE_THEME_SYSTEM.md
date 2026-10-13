# SPIKE Three-Theme System — neutral scaffold

The legacy ten-theme palette registry has been removed from active theme selection. Exactly three theme IDs are supported: `1`, `2`, and `3`. Their final names, palettes, contrast targets, and visual signatures are intentionally **not assigned yet**; they must be supplied and approved before visual styling is finalized.

- `js/theme.js` is the active registry and browser preference authority.
- `css/spike-three-theme-authority.css` currently provides a temporary palette scaffold for IDs 1–3, not final approved design.
- The browser preference key is `spike-theme-choice-v3`. Known older browser preference keys are removed when the new code loads.
- The existing database field is `user_app_settings.theme_style`; supported values are 1–3.
- `supabase/migrations/202610120001_reset_legacy_theme_preferences.sql` resets stored theme preferences to ID 1 so an old selection is not silently reinterpreted. This migration has **not** been applied to a live database and requires deployment approval.

Theme selection is limited to three choices. This is a source-package audit; it does not establish that a live deployment, browser cache, CDN copy, or production database has been updated.
