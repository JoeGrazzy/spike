# SPIKE Feed Existing-Feature Accessibility Audit — 2026-10-06

## Scope
Audit and improve entry points to existing Feed/navigation functionality only. No new product features were added. Supabase migrations, database functions, RLS, RPC contracts, storage policies, and deployed Edge Functions were not changed.

## Confirmed root cause fixed
- `feed.html` contained the existing `#spikeSmartNav` panel, but there was no `#spikeSmartNavBtn` in the header. The controller in `js/feed-runtime-05.js` exits early when the trigger is missing, so this navigation panel had no user-operable opening path.
- `feed.html` also included `#spike-feed-hidden-legacy-nav`, a CSS rule hiding `#spikeSmartNav` with `display:none!important`.
- The Smart Navigation `Activity` item attempted to click a matching legacy bottom-nav item, but there is no `data-spike-nav="activity"` item. The action therefore did nothing.

## Fixes
- Added an accessible header trigger with `aria-controls`, `aria-expanded`, and a descriptive accessible name.
- Removed the specific CSS rule that permanently hid the existing Smart Navigation panel. The panel remains initially hidden and is controlled by its existing runtime.
- Routed the existing Activity item directly to `notifications.html`; existing Home, Discover, Start, and Profile routing remains intact.
- Added regression tests in `js/audit/tests/feed-smart-navigation.test.mjs`.
- Regenerated the reviewed protected-file integrity entries for the two intentionally changed protected files. No protected files were deleted; no backend/migration files changed.

## Existing features found that warrant further discoverability/handler review
- `spike_edu.html`: linked from `spike_intelligence.html`, but no direct Feed entry point was found in the static scan. This is indirect discoverability, not a confirmed unreachable page.
- `chat_room.html`: no static incoming HTML link found in the scan. Must trace dynamic room routing and compare with `room.html`, `room_chat.html`, and `rooms.html` before deciding whether it is orphaned.
- `reset-password.html`: no static incoming link, but used by authentication recovery redirects. Not a normal Feed navigation item and should not be added to the menu.
- `share.html`: no static incoming HTML link, but used by `js/spike-share.js`. Not confirmed unreachable.
- Existing feed utilities `spikeCoffeeBtn`, `spikeAiSearchBtn`, `spikeThemeIcon`, and `spikePulseBtn` are inside `#feedHiddenUtilities` (hidden). Trace their external/alternate entry points before deciding whether any user-facing feature is actually inaccessible; do not expose utility controls blindly.
- Feature Center offers Custom Feeds, Polls, Signal Series, Collaborations, Creator Memberships/Store, Search, Reputation, Resume, and Dashboard. Its actions should be individually checked for backend/auth preconditions and useful error feedback in a follow-up pass.

## Navigation strategy
- Keep the hamburger menu as the broad route directory and the header Smart Navigation panel as a compact shortcut surface.
- Do not unhide the bottom navigation bar as a second step: `feed.html` intentionally hides it, and several runtimes manipulate it for contextual behavior. Reintroducing it without tracing adaptive-nav and composer state could create competing navigation and layout conflicts.
- Do not add ordinary navigation buttons for authentication-only routes such as password reset or for share routes that are invoked contextually.

## Verification
- `npm run check`: PASS — 381 passed, 0 failed, 1 skipped (382 tests total).
- The skipped test is the optional live WCAG browser audit; Playwright/Axe dependencies and live browser/device computed-style verification were not available in this environment.
- Static tests verify the trigger, panel visibility authority, Activity destination, and existing navigation handler presence. They do not replace manual Android/browser interaction testing.

## Files changed
- `feed.html`
- `js/feed-runtime-05.js`
- `js/audit/protected-baseline.json` (reviewed integrity metadata for the two intentional core edits)
- `js/audit/tests/feed-smart-navigation.test.mjs` (new regression tests)
- `FEED_EXISTING_FEATURE_ACCESSIBILITY_AUDIT_2026-10-06.md` (this report)

## Follow-up repair: hidden existing utilities
- Confirmed root cause: `#feedHiddenUtilities` is intentionally hidden and `aria-hidden`, but the only operational controls for Ask SPIKE, Coffee, Theme, and Pulse are inside it. Their original handlers exist, but users cannot activate them through the visible interface.
- Added four entries to the existing hamburger menu: Ask SPIKE, SPIKE Coffee, Change theme, and My Pulse. Each menu action closes the menu and invokes the existing control/handler; no second implementation or duplicate event listener was introduced.
- Added a regression test asserting each visible menu entry and its existing-control mapping.
- Updated protected-file integrity metadata for the intentional changes to `feed.html` and `js/feed-runtime-04-3.js`.
- Regression result after this pass: `npm run check` PASS — 382 passed, 0 failed, 1 skipped (383 total). The optional live browser accessibility audit remains skipped because Playwright/Axe dependencies are unavailable. No real-device interaction test was run.
