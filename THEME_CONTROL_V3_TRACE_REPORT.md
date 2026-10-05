# SPIKE Theme Control V3 — Trace / Fix Report

## Protected baseline
The protected baseline was not modified in place. This package is a new derivative of SPIKE-theme-control-v2.

## Trace
Canonical chain:

`theme.js` → `html[data-spike-style]` → `css/theme.css` → page/component CSS → global visual authority → `css/spike-theme-runtime-v3.css` → visible components.

## Root causes found
1. `spike-theme-runtime-v2.css` was still loaded as a duplicate runtime and could compete with later page CSS.
2. `theme-browser-test.html` loaded `spike-beauty-v1.css` after the v2 runtime.
3. Several component namespaces were only partially bridged to the canonical `--spike-*` palette.
4. Education used both `--edu-surface-2` and `--edu-surface2`; the former was not defined.
5. Navigation feature CSS consumed `--spn-life` without a theme-runtime contract.
6. Some pages placed global visual authority after the old runtime, so the old runtime was not actually final.

## Fix
- Added `css/spike-theme-runtime-v3.css` as the final theme-consumer boundary.
- Removed v2 runtime stylesheet references from themed HTML pages.
- Loaded v3 after the global visual authority (or as the final local stylesheet on the standalone theme browser).
- Mapped legacy namespaces to canonical `--spike-*` variables with a one-way alias model.
- Added both `--edu-surface-2` and `--edu-surface2` aliases.
- Added `--spn-life` to the canonical runtime contract.
- Fixed the Education consumer spelling where `--edu-surface-2` was used.
- Added regression tests for runtime ordering, alias coverage, education compatibility, and navigation token coverage.
- Updated theme-authority testing to scope itself to pages that actually load the theme engine; excluded the bridge harness from production-theme assertions.

## Backend
No Supabase migrations, RLS policies, RPCs, storage policies, triggers, or database contracts were changed.

## Verification
Focused theme tests: **10/10 PASS**.

Full project audit: **362 passed / 9 failed / 1 skipped**.

Remaining failures are outside this theme-control change: mobile safe-area/navigation assertions, protected-baseline integrity, reaction tests, safety-center fixture, and the bridge-harness UI contract. They are not being presented as fixed by this package.

## Device limitation
A real Android/browser visual run was not available in this environment. Code-level cascade/order and automated theme contracts were verified; physical-device rendering still requires browser/device verification.
