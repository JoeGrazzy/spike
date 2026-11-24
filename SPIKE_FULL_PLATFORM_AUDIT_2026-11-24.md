# SPIKE Full Platform Audit — 24 November 2026

## Scope and source

Audited the latest `SPIKE_NOTIFICATION_SOUND_ENABLED_BUILD.zip` source archive. The project contains 28 HTML pages, 62 JavaScript files and 64 CSS files. The connected Supabase project is `Spikemediachat` (`veagqanfilmbchlvlpcc`), status `ACTIVE_HEALTHY`.

## Verification completed

- `npm test`: 49 Node tests passed, 0 failed; the separate messages-page smoke test also passed. The Node suite includes the new Friends/Supabase contract regression tests.
- `npm run check`: passed; 62 JavaScript files, 28 HTML pages and 64 CSS files checked, including local references, Worker configuration and production migration baseline consistency.
- Frontend RPC inventory: all 74 statically discovered RPC names exist in the live `public` schema.
- Frontend table inventory: all statically discovered `.from(...)` table references were checked against live schema; non-table references correspond to Supabase Storage buckets.
- Friends lifecycle RPCs checked against live signatures and grants: send, accept, decline, cancel, unfriend, block, unblock, list incoming/outgoing and mutual friends. Authenticated execution is present and anonymous execution is absent for the checked friendship RPCs.
- `follows` and `blocks` RLS policies inspected. Requests are pending-only, inserts are block-aware, and direct acceptance is not allowed by the client insert policy. Block and unblock functions operate with the caller's identity; block also removes both relationship directions.
- Existing Friends UI action handlers are wired to the corresponding social wrapper/RPC and refresh connection state after success.

## Changes in this audit build

- Added `scripts/friends-supabase-contract.test.js` to guard the manual request, accept, decline, cancel, unfriend, block and unblock wiring, RPC argument names, refresh behavior, manual discovery and responsive stylesheet loading.
- Added this audit report.

No production database migration was applied: the existing friendship schema and RPC contract already matched the frontend. No unrelated page or database behavior was changed merely to create cosmetic churn.

## Remaining verification boundaries

- No browser automation session or two independent authenticated production accounts were available for a real end-to-end UI interaction test.
- No physical Android/iOS device testing was performed.
- No public Cloudflare deployment was performed; deployment and cache propagation remain separate steps.
- Supabase Auth leaked-password protection remains disabled according to the live security advisor and requires dashboard-level review. The advisor also reports authenticated `SECURITY DEFINER` functions; these require function-by-function authorization review, not blanket changes.
