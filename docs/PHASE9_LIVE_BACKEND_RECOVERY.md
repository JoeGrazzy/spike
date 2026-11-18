# SPIKE Phase 9 — live backend recovery snapshot

**Archive created:** 18 November 2026, 22:43 UTC  
**Project:** `Spikemediachat` (`veagqanfilmbchlvlpcc`)  
**Inspection refreshed:** 18 November 2026, 23:47 WAT  
**Production change policy for this phase:** read-only. No production schema, Auth, Storage, or data changes were made.

## Live Supabase state (refreshed)

- Project is `ACTIVE_HEALTHY`, PostgreSQL 17.12, region `eu-west-1`.
- Remote migration ledger contains **19 applied versions**, ending with `spike_manual_purchase_backend_v1`.
- All **27 public base tables** currently have RLS enabled.
- The live database includes `spike_purchase_products`, `spike_purchase_orders`, `spike_purchase_events`, and `spike_verified_subscriptions`.
- Seven purchase RPCs are deployed: catalogue, create order, own order history, report payment, admin list, admin approve, and admin reject.
- `private.is_admin()` checks the authenticated JWT user against `eletexjoeytex@gmail.com` and requires an active `admin` profile.
- Purchase orders are customer-readable only through an owner-scoped policy; direct authenticated updates are not granted. Wallet ledger and balance remain read-only to browser clients.
- Order creation is idempotent per user/key. Order references and payment references are unique; wallet ledger references are unique.
- Coin approval locks the order row and performs transactional settlement by writing a ledger credit and wallet balance update inside one database transaction. Verified subscription approval writes `spike_verified_subscriptions` with the 30/365-day duration from the server-side order snapshot.
- WhatsApp `09159096952` is the support contact only, not a bank destination.
- No Edge Functions are deployed; the payment workflow currently uses PostgreSQL RPCs.

## Current Security Advisor findings

- Leaked-password protection is disabled (Auth warning). Enable it in Supabase Auth password security settings.
- Seven `SECURITY DEFINER` purchase RPCs are executable by `authenticated`. The three admin RPCs contain an explicit `private.is_admin()` owner check; customer RPCs derive identity from `auth.uid()`. Keep these checks and fixed search paths intact.
- `spike_purchase_events` has RLS enabled but no policies. Direct `anon` and `authenticated` table privileges are absent, so the audit table is not directly readable/writable from browser clients; the trusted RPCs write audit events. Do not add broad client policies merely to silence the advisor.
- Health Advisor currently reports no findings.

## Source archive reconciliation gap

At the Phase 9 snapshot, the archive contained three migration SQL files (room host handoff, opt-in MFA enforcement, and single-owner admin access). Phase 11 subsequently adds a fourth local migration for catalogue publication; the original missing historical migration bodies remain absent. The live remote migration ledger at Phase 9 had 19 entries, including `spike_manual_purchase_backend_v1`, but its SQL body is absent from this archive. The archive's original Phase 9 notes were written before that remote payment migration was applied and are historical, not a current backend status report.

Do not fabricate the missing migration body, reset production, replay this partial migration folder, or mark migrations as applied. Recover the canonical schema and migration source from an authenticated development environment using a current pinned Supabase CLI, then reconcile it with the remote schema before further DDL changes.

## Payment operational boundaries

- The live catalogue currently publishes the Verified monthly and yearly products. No SP Coin product is active in the current catalogue.
- Customer payment reporting is not payment verification. Only the owner can approve after independently checking the bank statement.
- Do not invent or embed bank details. SPIKE support must provide verified payment instructions manually.
- No payout, creator earnings conversion, or room-gifting settlement should be inferred from the purchase workflow.

## Verification boundary

The source archive passes its local automated checks, but these are source tests, not authenticated browser/device end-to-end tests. No test purchase was created, no wallet balance was changed, and no real customer payment was approved during this inspection.
