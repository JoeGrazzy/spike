# SPIKE 3.0 — Five-Theme Modernization Audit

**Date:** 2026-10-23  
**Phase:** 1 — Audit completed

## Scope

Reviewed the existing theme runtime (`js/theme.js`), canonical palette stylesheet (`css/spike-three-theme-authority.css`), Settings theme selector and account persistence (`settings.html`), and all root HTML pages that bootstrap the active theme.

## Findings

1. SPIKE previously exposed three selectable themes through a central registry and the `spike-theme-choice-v3` local preference.
2. The active theme was bootstrapped inline on 22 HTML pages, so changing only the registry would have left page-load flashes or incorrect IDs on some screens.
3. Theme palette tokens were centralized, but there were still older component-specific CSS layers. These should continue consuming shared semantic tokens rather than hard-coded theme colors.
4. Settings included a Theme 2-only light/dark/system mode selector. That conflicts with the new requirement for five distinct, fully specified theme personalities and was removed.
5. Theme choices also sync to `user_app_settings.theme_style`. Existing numeric IDs 1–3 are retained for compatibility; new IDs 4–5 are now available. No database schema or production data was changed.
6. Existing automated suite has a known baseline limitation: the supplied archive omits several Supabase Edge Function source files referenced by tests, including `admin-user-ops`, `admin-register-user`, and `spike-webauthn`. The protected-baseline test also reports another omitted source path. These failures are not caused by the theme changes.

## Implementation safeguards

- Keep exactly five selectable theme options.
- Preserve the current settings/account persistence path.
- Keep semantic CSS aliases for older page components.
- Use a versioned theme bootstrap on every HTML page.
- Do not deploy or modify production database contents.
