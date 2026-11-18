# SPIKE Phase 10 — live payment/frontend reconciliation

**Date:** 18 November 2026  
**Base archive:** `SPIKE_PHASE9_LIVE_BACKEND_RECOVERY.zip`  
**Production database:** read-only during this historical Phase 10 inspection; Phase 11 subsequently published the package catalogue.

## Findings fixed in source

- Removed the stale admin payment-centre notice claiming purchase tables and RPCs do not exist.
- Corrected the admin purchase status filter to use the deployed `pending_payment` value.
- Updated the admin connection status to reflect the deployed owner-only purchase workflow.
- Split customer purchase history into SP Coin orders and Verified subscription orders, rather than rendering every order in the coin list.
- Made Verified plan prices and durations display from the active server catalogue. Unpublished plans remain disabled instead of advertising stale hard-coded prices.
- Added dedicated status regions so order creation/payment-report messages no longer replace the catalogue or erase rendered order history.
- Removed the asynchronous `window.open` handoff, which browsers may block after an awaited RPC; the customer now explicitly taps the rendered WhatsApp link from the order card.
- Kept payment reporting separate from owner approval; the browser still cannot mutate wallet balances or ledger rows.
- Updated Phase 8/9 documentation to distinguish the live remote database from the older, partial local migration source.

## Live backend facts checked

- Project `veagqanfilmbchlvlpcc` is healthy on PostgreSQL 17.12.
- At the Phase 10 inspection: remote migration ledger had 19 entries; the archive had three local migration SQL files. Phase 11 adds a fourth local migration and the twentieth remote migration.
- 27 public base tables have RLS enabled.
- Seven purchase RPCs are deployed.
- At the Phase 10 inspection: Verified monthly ₦500/30 days and yearly ₦3,000/365 days; no active SP Coin package. See Phase 11 for the current active catalogue. Live counts at inspection: 0 purchase orders, 0 purchase events, 0 verified subscriptions, 0 wallet-ledger rows, and 1 wallet account.
- `private.is_admin()` checks the exact owner email and active admin profile.
- `spike_purchase_events` has no direct anon/authenticated privileges; its RLS/no-policy advisor finding is consistent with the intentional RPC-only audit access model. Authenticated clients also have no direct order UPDATE or wallet-ledger INSERT privileges.
- Leaked-password protection remains disabled and requires a dashboard Auth setting change.

## Verification

Automated source tests and JavaScript syntax checks are run as part of this phase. These checks do not replace authenticated browser/device testing. No production migration, Auth setting, customer data, wallet balance, or payment order was changed.

## Still required

1. Recover canonical remote schema/migration source; do not fabricate the missing purchase migration.
2. Enable leaked-password protection in Supabase Auth.
3. Run authenticated owner and non-owner browser tests for payment queue access, approval/rejection, and WhatsApp handoff.
4. Confirm actual SP Coin SKUs/prices before publishing coin packages.
5. Keep payout and room-gifting flows disabled until their own trusted server-side workflows are implemented and tested.
