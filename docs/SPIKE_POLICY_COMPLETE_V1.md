# SPIKE Policy Complete V1

This release completes the SPIKE Policy stack against the actual project.

## Live backend

- Canonical Policy Core: `spike_policy_rules`, `spike_policy_versions`.
- Server-side prohibited-term engine: `spike_prohibited_terms` + `moderate_spike_content`.
- Automatic enforcement for public Signals, Stories, comments, Room messages, and SPIKE World text paths.
- Enforcement cases: `spike_policy_cases`.
- User appeals: `spike_policy_appeals`.
- Automatic user notifications for removals and appeal decisions.
- Admin moderation and appeal RPCs.
- Admin-managed prohibited-term catalog.
- Recommendation eligibility view and eligibility RPC exclude removed/blocked posts.
- Ten-theme account setting constraint corrected from 1–6 to 1–10.

## User-facing project changes

- `policy.html` is theme-native and connected to the live Policy Core.
- `policy_appeals.html` provides case history, appeal submission and appeal status.
- `notifications.html` understands Policy removal/appeal notifications and routes them to the Policy & Appeals center.
- `feed.html` runs a client preflight for immediate UX while the database trigger remains authoritative; recommendation loading uses the server eligibility view.
- Feed menu now exposes SPIKE Policy.
- `admin.html` includes Policy & Moderation, appeal queue and governed prohibited-term management.

## Theme contract

The Policy Center and Appeals Center use the same `css/theme.css` and `js/theme.js` authority as the rest of SPIKE. The UI uses theme tokens instead of a separate visual identity, so all ten existing styles are supported:

1. Aurora Glass
2. Velvet Nocturne
3. Solar Ember
4. Emerald Atelier
5. Ocean Cobalt
6. Desert Rose
7. Royal Amethyst
8. Arctic Platinum
9. Neon Citrus
10. Midnight Cherry

## Prohibited-term governance

The live prohibited-term table is intentionally empty in this release. No invented slur/banned-word dataset was inserted. A policy administrator must add governed terms from Admin → Policy & Moderation, mapping each term to a canonical policy ID and selecting match mode, severity and enforcement.

## Validation performed

- `npm test`: 31 JavaScript files + 111 inline HTML script blocks passed syntax checking; static audit passed.
- `npm run audit`: production artifact generated successfully with 25 HTML pages.
- Live policy lifecycle transaction verified: governed term → post takedown → user appeal → admin approval → notification path, with all test data rolled back.
- Live recommendation eligibility transaction verified that a deleted post is excluded.
- Live theme setting constraint verified to accept theme 10.

## Known security blocker

The Supabase advisory currently reports RLS disabled on these pre-existing private tables:

- `private.rpc_authorization_audit`
- `private.spike_debug_reports`
- `private.spike_moderation_decisions`

The advisory explicitly recommends enabling RLS, but enabling it without appropriate policies would block access. This release does **not** auto-apply that destructive/ambiguous security change. The existing moderation completion therefore uses the new RLS-protected public `spike_policy_cases` table for the canonical user/admin workflow.
