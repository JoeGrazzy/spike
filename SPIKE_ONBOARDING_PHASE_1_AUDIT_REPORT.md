# SPIKE 3.0 Optional Onboarding — Phase 1 Audit & Plan

Date: 2026-10-23

## Scope audited
- Existing static multi-page application and entry flow
- Supabase auth setup and post-auth navigation
- Existing Help Center and Guide pages
- Five-theme registry and runtime
- Test baseline and migration conventions

## Findings

1. **Application architecture:** SPIKE is a static, multi-page HTML application. The sign-in/sign-up entry point is `index.html`; verified sessions route to `feed.html` after profile resolution. The signup flow can also show a one-time SP ID welcome modal before redirecting.
2. **Auth integration:** Supabase JS v2 is loaded on the entry page and app pages. `js/supabase-singleton.js` protects the shared client instance. Feed runtime already uses the authenticated session. Onboarding must not change authentication gates or intercept sign-in, OTP, OAuth, or password-recovery flows.
3. **Existing learning surfaces:** `help.html` is a substantial Help Center and `guide.html` is an existing feature guide. Onboarding should complement these instead of replacing or duplicating them. A replay entry can link to those resources.
4. **Theme system:** `js/theme.js` defines the five canonical themes: Midnight Luxe, Arctic Glass, Emerald Obsidian, Sandstone Studio, and Cosmic Pulse. New UI should inherit theme tokens and avoid hard-coded palette assumptions.
5. **Persistence:** No existing onboarding-specific schema or implementation was found in the audited files. A dedicated per-user progress table is the cleanest cross-device design. A migration can be packaged but must not be applied to production without explicit authorization. Client-side fallback should allow onboarding to remain optional if the migration is not yet installed.
6. **Testing baseline:** `npm run check` passes: 553 passed, 0 failed, 1 skipped (554 tests total). This is the baseline before onboarding changes.
7. **Delivery constraint:** The previous repaired project remains the starting point. The project has not been deployed; no production database or function changes are authorized by this task.

## Agreed product decisions
- Tutorial is **optional**.
- Welcome offers **Start Tutorial** and **Skip for Now**.
- Skipping grants normal app access immediately.
- Users can exit at any time, resume later, and replay from Help/Settings.
- Progress should persist per authenticated user and follow them across devices when the migration is installed.
- UI should support all five themes, mobile and desktop, keyboard navigation, and reduced-motion preferences.
- Practice steps must not publish posts, send messages, start calls, change settings, or contact other users.

## Implementation sequence
1. Audit and plan (this phase)
2. Welcome screen and first-entry flow
3. Reusable tutorial engine
4. Supabase progress schema/client integration
5. Lessons and contextual help
6. Theme, mobile, accessibility polish
7. Automated regression tests and QA
8. Final audit, report, and ZIP package

## Risks / mitigations
- **Missing database migration:** local per-user fallback; show no blocking error and allow normal app use.
- **Auth/routing regression:** do not alter the authentication state machine; initialize onboarding only after a valid session is available.
- **Accidental real actions:** tutorial interactions use navigation and explanatory steps only, never mutate social content.
- **Theme regressions:** use existing CSS custom properties and theme-change event; add static contract tests.
- **Unreviewed production changes:** migration is a file in the package only; no remote deployment or SQL execution.
