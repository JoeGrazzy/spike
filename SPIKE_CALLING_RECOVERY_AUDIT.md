# SPIKE Calling Recovery — Audit and Patch Report

Date: 2026-11-24
Baseline: `SPIKE_CALLING_RECOVERY_PATCHED.zip`
Scope: source archive inspection and focused client-side call-signalling repair.

## Baseline inspected
- ZIP extracted and integrity checked successfully.
- Project validator: 62 JavaScript files, 28 HTML pages, 66 CSS files; validation passed.
- Existing automated tests before patch: 19 passed, 0 failed.
- Relevant implementation: `js/spike-call-engine.js`.
- Relevant schema/security migrations include one-to-one call sessions, participant authorization, per-user private call-event topics, call expiry, missed-call handling, and MFA enforcement.

## Confirmed client-side race conditions and corrections

### 1. Caller could miss the accepted event
The caller relied on a transient private Realtime broadcast (`accepted`) to begin SDP offer negotiation. If the callee accepted while the caller's per-call channel was not yet joined (for example while caller media permission was pending), the broadcast could be lost. The database row was already durably changed to `accepted`, but the row-change handler did not process that state.

**Patch:** Treat the authenticated call-session row's `accepted` status as the durable source of truth. The caller now records acceptance and starts negotiation as soon as its peer connection is ready. The broadcast remains a fast-path hint. Offer creation is guarded against duplicate execution.

### 2. ICE candidates could be emitted before channel join
The caller creates its peer connection before the private call channel is guaranteed to be subscribed. Early ICE candidates could therefore be sent before the channel was ready and silently lost.

**Patch:** Queue outgoing signalling messages until the private channel reports `SUBSCRIBED`, then flush the queue. Check the Realtime send result, and fail offer setup visibly if the offer cannot be delivered.

### 3. Active call channel could become permanently unavailable
A failed or closed per-call Realtime channel previously had no independent retry/rejoin loop. The incoming-call listener had its own retry logic, but that did not restore the active call's private signalling topic.

**Patch:** Added a separate per-call channel generation guard and capped exponential retry (1s up to 15s). Failed, timed-out, and closed subscriptions mark signalling unavailable and schedule a clean rejoin. Queued SDP/ICE messages remain queued until the rejoined channel acknowledges delivery. The app also attempts to rejoin when connectivity/focus returns. Cleanup invalidates stale callbacks and cancels pending retry timers so an old call cannot reconnect after it has ended.

## Validation after patch
- `node --check js/spike-call-engine.js`: passed.
- `npm test`: 23 passed, 0 failed (19 baseline + 4 focused regression checks).
- `npm run check`: passed; 62 JS, 28 HTML, 66 CSS and local references validated.
- ZIP archive integrity check: passed.

## Remaining production blockers — not verified by source tests
1. A live two-account call test has not been run. Must verify A→B voice, A→B video, accept, decline, cancel, timeout, repeated calls, and network interruption on real devices.
2. The package configures public STUN only. Calls on restrictive NATs/firewalls may fail without TURN relay. TURN is an operational production requirement for broad network reliability; no credentials are present in this package.
3. Supabase migrations and RLS policies were inspected in source only. No production migration was applied and no live project schema/policy state was changed or certified.
4. Cloudflare deployment was not performed. No claim is made that the patched package is live.

## Deployment guidance
Deploy only to a staging environment first. Confirm the connected Supabase migration history and private Realtime policies, then run two-account tests on separate networks and Android devices. Do not treat the source-level test pass as production sign-off.

## Files changed
- `js/spike-call-engine.js`
- `scripts/spike-regression.test.js`
- `SPIKE_CALLING_RECOVERY_AUDIT.md`

No existing authentication, messaging UI, database migration, or Worker configuration was intentionally changed.
