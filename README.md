# SPIKE — Canonical Project

This package is the canonical, integrated SPIKE web project. It keeps the product pages, shared theme/runtime, Policy system, Notifications, Admin moderation, creator Insights/Engagement, and Supabase migrations together.

## Start here
- `index.html` — entry/auth
- `feed.html` — main social feed; no notification bell in the header
- `notifications.html` — Activity & Notifications center
- `engagement.html` — creator Insights / Engagement dashboard
- `policy.html` — public SPIKE Policy Center
- `policy_appeals.html` — user policy cases and appeals
- `admin.html` — admin operations, including Policy & Moderation

## Shared runtime
- `js/theme.js` + `css/theme.css` — single theme source of truth (10 themes)
- `js/spike-adaptive-nav.js` — shared navigation behavior
- `js/spike-surface-controls.js` — shared surface controls
- `js/telemetry.js` — event telemetry

## Policy flow
1. Content is preflight-checked in the Feed UI.
2. The database policy trigger is authoritative for posts/stories.
3. Violations create a policy case and notification.
4. Users review cases and submit appeals in `policy_appeals.html`.
5. Authorized admins review cases/appeals in `admin.html`.
6. Approved appeals can restore eligible content.
7. Recommendation eligibility excludes removed/ineligible content.

## Build
`npm run build` generates the deployable `dist/` artifact.

## Verification
`npm run audit` runs JavaScript syntax, inline HTML script, static integrity, and production build checks.

Live browser/device screenshot validation is not claimed in this package.
