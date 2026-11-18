# SPIKE Phase 2 — Wallet, Payments & Admin Review Audit

Date: 2026-11-18
Project: `veagqanfilmbchlvlpcc` (`Spikemediachat`)

## Verified live database state

The live public schema currently exposes only these financial records:

- `wallet_accounts`: `user_id`, `currency`, `available_balance`, `pending_balance`, `updated_at`.
- `wallet_ledger`: `id`, `user_id`, `entry_type`, `amount`, `currency`, `reference`, `description`, `status`, `created_at`.
- `referrals`: referral identity/status and `points_awarded` (not a redeemable financial ledger).

No live table was found for coin purchase orders, payment reports, bank-transfer references, verified subscriptions, creator earnings, creator payout requests, payout bank details, or settled room gifts. No matching financial approval/settlement RPC was found in the inspected live function catalogue. The `spike_gifts`, gift eligibility, gift-send and wallet coin-source-summary objects referenced by the room UI are also absent.

## Frontend-to-backend status

| Area | Current frontend state | Live backend state | Safe status |
|---|---|---|---|
| Wallet balance/history | Reads `wallet_accounts` and `wallet_ledger` for signed-in user | Tables exist; live data currently empty | Read-only |
| SP Coin purchase | UI markup describes packages and WhatsApp transfer | No order or payment-report tables/RPCs | Disabled; do not accept transfers |
| Payment reporting | UI describes transfer reference submission | No payment-report record store | Not implemented |
| Owner payment approval | Admin markup contains purchase centre | Admin controller explicitly disables `data-view="purchases"`; no approval controller | Disabled |
| Verified subscription | Monthly/yearly plan UI exists | No subscription request/entitlement table or activation RPC | Disabled |
| Creator earnings | UI describes earnings and conversion | No creator earnings ledger | Disabled |
| Payout bank details | UI contains bank form | No protected payout-details store/service | Disabled; do not collect bank details |
| Withdrawals | UI describes withdrawal windows and eligibility | No payout request/settlement workflow | Disabled |
| Room gifts | Room feature references gift objects | Required table and RPCs absent | Disabled |
| Referrals | Basic referral table exists | `points_awarded` only; no audited SP Points wallet/settlement contract confirmed | Not redeemable |

## Phase 2 changes in this handoff

- Updated `wallet.html` copy so it no longer promises a working purchase reference, payment report, subscription request, or bank-details save while the relevant service is absent.
- Updated `admin.html` purchase-centre copy to state clearly that approval is disabled and that screenshots are not proof of payment.
- Kept the wallet read-only controller and disabled financial actions. No client-side balance mutation, simulated success, or direct wallet-ledger insert was introduced.
- No live Supabase schema, records, policies, or functions were changed.

## Required financial workflow before enabling payment approval

1. Define and migrate an auditable order model with immutable NGN amount, package/plan snapshot, coin quantity, unique human-readable reference, buyer, status and timestamps.
2. Record a user's payment report separately (bank transfer reference, payer name, reported amount/time and optional evidence path); treat it as a claim, never as proof.
3. Implement an owner-only transactional approval RPC that locks the order, validates exact amount/currency/status, prevents duplicate approval, writes one ledger credit and marks the order approved atomically.
4. Implement rejection/cancellation with reason and append-only audit events; never delete or rewrite a posted financial ledger entry.
5. Enforce owner authorization in the database using the existing `private.is_admin()` owner check, not merely hidden frontend controls.
6. Add subscription entitlements with start/end dates and identity-review status; activate only after verified payment and required identity review.
7. Add payout details using protected storage/strict RLS and a separate payout request/hold/settlement ledger. Never store full bank account details in browser local storage or expose them to other users.
8. Add idempotency, duplicate bank-reference detection, concurrency tests, RLS tests and owner-only negative tests before deployment.

## Business decisions still required

The frontend currently displays some package/plan prices and payout rules, but these have not been verified as the approved business configuration. Before creating immutable order products, confirm:

- SP Coin package tiers, NGN prices, base coins and bonus coins.
- Whether displayed Verified prices (₦500 monthly and ₦3,000 yearly) are final.
- Whether the contact `09159096952` is only the official WhatsApp support contact or also the intended payment-instruction contact. No bank account destination has been provided in the reviewed project context; do not invent one.
- Creator earnings conversion rate, eligibility rules, payout minimum/maximum and schedule.
- Whether room gifts and referrals award spendable SP Coins, non-cash points, or creator earnings.

## Deployment blocker

The latest project archive still lacks the first 15 historical SQL migration bodies although the live project has 18 migration-history entries. Recover the complete migration history using the authenticated Supabase CLI before attempting to reconcile or publish new migrations. Do not replay the partial migration directory against production.

## Fresh Supabase advisor check (2026-11-18)

- Security: one warning — leaked-password protection is disabled. Enable it in Supabase Auth password/security settings; this is a dashboard configuration change, not a frontend code change.
- Health: no advisor findings.
- Performance: 31 indexes are currently unused. The live application tables are nearly empty, so this is expected for a new/low-traffic project. Do not drop these indexes based only on the current advisor snapshot; re-evaluate after representative traffic and query-plan review.
