# SPIKE Theme Conflict Audit — continued pass

## Scope
Audited the rebuilt source package's HTML, CSS, JavaScript, theme registry, inline bootstraps, theme-specific component selectors, and documentation. This is a source-package audit only; it does not inspect a live deployment, browser cache, Git history, external CDN copies, or live Supabase data.

## Confirmed changes in this pass
- Replaced the unapproved temporary theme names Cinder, Tidal, and Lumen with neutral Theme 1–3 labels in the active registry, settings selector, and theme-focused tests. The final theme names/designs remain pending user direction.
- Removed the stale premium-theme integration README and old premium visual QA report from the package.
- Replaced stale “SPIKE PREMIUM THEME SYSTEM” labels in inline CSS comments on Friends, Admin, and Help pages.
- Removed a per-theme geometry exception in `js/spike-native-v2.js` that made theme 3 native panels/cards square with thicker borders while themes 1 and 2 used shared geometry.
- Preserved the canonical three-theme registry and palette authority.

## Deep scan findings
- Active theme registry and settings now expose only neutral IDs 1–3; active theme-focused tests no longer require the former placeholder names.
- The former ten-theme names may still appear in protected historical audit baselines and archived migration/test records. These are historical evidence, not active selectable themes, and should not be erased without a deliberate audit-history policy.
- The repository contains other “premium” assets such as `css/premium-back.css`, `css/spike-premium-loader.css`, and `js/premium-back.js`. Their names alone do not establish that they contain legacy theme palettes; they are not deleted because they may implement unrelated navigation/loading behavior.

## Important remaining architecture note
The package still has multiple theme-related CSS layers: `css/theme.css`, `css/spike-theme-experience-v3.css`, `css/spike-theme-final-authority-v1.css`, `css/spike-theme-runtime-v3.css`, and `css/spike-three-theme-authority.css`. The first three legacy-named layers contain component rules and/or compatibility variable aliases, not just old palette definitions. Removing them without extracting those rules could break UI components. They remain intentionally for now; this is a known consolidation task, not a claim that all theme layers have been eliminated.

## Data and runtime limits
- `js/theme.js` accepts only IDs 1–3 and clears known legacy localStorage keys.
- Legacy localStorage clearing only runs in browsers that load the new code; it cannot clear users' browsers remotely before deployment.
- The Supabase migration resetting `user_app_settings.theme_style` has not been applied to a live database.
- Historical audit baselines may contain old strings by design and are retained as audit history, not active theme definitions.
- No live deployment or full browser visual QA was performed during this pass.

## Verification targets
Run `npm test`, syntax-check all JavaScript, validate ZIP integrity, and scan active source for theme IDs outside 1–3 before release.
