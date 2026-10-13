# SPIKE Source Audit — Pass 4

## Scope and integrity

- Working source: `SPIKE-three-theme-platform-pass.zip` (extracted to a separate working directory; original archive preserved).
- No production database, live website, CDN, or user account was accessed or changed.
- Protected Feed runtime `js/feed-runtime-04-2.js` was not edited.
- The separate `css/spike-theme-contrast-repair-v1.css` named in earlier notes is not present in this source archive. The fix below is therefore applied to the included canonical final-authority stylesheet, not to a missing file.

## Change made

`css/spike-theme-final-authority-v1.css`
- Extended the existing theme-owned nested-card selector group to include `.spike-menu-sheet .menu-list button` and `.spike-menu-sheet .menu-list a`.
- These legacy Feed/Help menu cards now use `--theme-surface-soft`, `--spike-text`, and `--spike-line` from the existing theme contract, instead of retaining their page-local fixed dark gradient. Existing `.menu-v3-grid` styling is retained.

`js/audit/tests/theme-final-authority-v1.test.mjs`
- Added a regression test asserting legacy nested menu cards use the shared theme surface rule and all three theme IDs remain registered in the palette authority.

## Verification performed

- `node --test js/audit/tests/theme-final-authority-v1.test.mjs`: 5 passed, 0 failed.
- `npm run syntax`: passed (`node --check js/spike-native-v2.js`).
- `npm test`: 482 tests discovered, 481 passed, 0 failed, 1 skipped. The skipped test is the optional browser accessibility audit requiring pinned development dependencies and Playwright browsers.

These are source-level automated checks. They do not establish browser visual correctness, live service behavior, or deployment status.

## Remaining work — not claimed complete

1. **Cloudinary Feed media:** `cloudinaryFeedImageUrl()` still transforms the URL in `js/feed-runtime-04-2.js`. A real failing asset URL and its original stored value are needed to determine whether the cause is the asset, transformation, access policy, or storage data. Keep the protected runtime unchanged until that trace is available; add an original-URL fallback only with a targeted regression test.
2. **Messaging:** source tests cover pair-scoped typing broadcasts and call topic authorization, but cross-account live testing of typing state, disconnect cleanup, delivery/read state, and unread counts remains unverified.
3. **Theme validation:** browser screenshots/computed styles are still needed for all three themes, particularly nested menus and contrast/focus states on small screens.
4. **Security and backend:** inspect and validate migrations/RLS/Edge Functions against the intended live schema; do not apply migrations without deployment approval.
5. **Feed/media reliability:** exercise upload, transform, fallback, image viewer, video playback, and offline/network error states using known test assets.
6. **Responsive/accessibility:** run the optional Playwright/WCAG suite and manual Android checks for safe areas, keyboard behavior, focus order, and reduced motion.
7. **Store/Paystack and notifications:** verify server-authoritative transaction paths and delivery behavior in a staging environment; source tests alone are not a live payment/notification verification.
8. **Release process:** run staging smoke tests, compare protected baselines, review diffs, then deploy only after explicit approval.

## Honest status

This pass makes one narrow CSS compatibility fix, adds a regression test, and runs the automated suite. It is not a complete file-by-file semantic audit, not a live deployment, and not proof every roadmap item is fixed.
