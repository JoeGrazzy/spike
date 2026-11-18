# SPIKE Phase 7 — Payment Readiness & Migration Recovery

**Date:** 18 November 2026  
**Project:** Spikemediachat (`veagqanfilmbchlvlpcc`, `eu-west-1`)  
**Scope:** Read-only production inspection plus local documentation/regression tests.  
**Production changes:** None. No schema, data, auth, storage, secrets, or deployments changed.

## 1. Live migration state

The connected Supabase project is `ACTIVE_HEALTHY` on PostgreSQL 17.12.0.000. The remote migration ledger reports 18 applied versions:

1. `20261118182458_spike_application_foundation_v1`
2. `20261118182603_spike_security_hardening_v1_1`
3. `20261118182628_spike_api_access_corrections_v1_2`
4. `20261118182902_spike_policy_and_message_fixes_v1_3`
5. `20261118183107_spike_social_compatibility_api_v1_4`
6. `20261118183158_spike_presence_privacy_fix_v1_5`
7. `20261118183405_spike_api_invoker_hardening_v1_6`
8. `20261118183414_spike_follow_request_upsert_fix_v1_7`
9. `20261118183706_spike_rooms_compatibility_and_dm_v1_8`
10. `20261118183728_spike_room_rpc_grants_v1_9`
11. `20261118183749_spike_room_start_rpc_v1_10`
12. `20261118183944_spike_room_fk_indexes_v1_11`
13. `20261118184329_spike_room_capacity_and_chat_guards_v1_12`
14. `20261118184342_spike_room_realtime_authorization_v1_13`
15. `20261118184507_spike_room_rpc_acl_hardening_v1_14`
16. `20261118205843_spike_room_leave_host_handoff_v1_15`
17. `20261118205959_spike_opt_in_mfa_rls_and_dml_enforcement_v1_16`
18. `20261118211133_spike_single_owner_admin_access`

The local source contains only the last 3 SQL migration files. The available Supabase connection can enumerate remote versions but does not return the original SQL bodies; the Supabase CLI is not installed in this workspace. Therefore full migration recovery is **not complete**. Do not create placeholder files, mark migrations repaired, reset the database, or apply guessed SQL.

### Required recovery procedure (project owner / trusted development machine)

1. Install/update Supabase CLI using the official installation instructions.
2. Authenticate with the project owner's Supabase account.
3. In the SPIKE repository, run `supabase link --project-ref veagqanfilmbchlvlpcc`.
4. Run `supabase migration list` and compare local and remote versions.
5. Back up the repository and database before reconciliation.
6. Use `supabase db pull` to capture the current remote schema into local migration history; review the generated SQL and compare it against the 18 remote versions.
7. Run local reset only against a disposable local database, never against production.
8. Commit recovered migration files and verify a clean migration list before designing/applying new schema changes.

Do not use migration repair unless the exact state mismatch and intended history correction are understood.

## 2. Live financial schema inspection

The targeted live catalog query found these financial/reward tables:

- `wallet_accounts`: `user_id`, `currency`, `available_balance`, `pending_balance`, `updated_at`.
- `wallet_ledger`: `id`, `user_id`, `entry_type`, `amount`, `currency`, `reference`, `description`, `status`, `created_at`.
- `referrals`: `id`, `referrer_id`, `referred_id`, `referral_code`, `status`, `points_awarded`, `qualified_at`, `created_at`.

No public tables matching payment, purchase, order, subscription, payout, earning, or gift were found by the catalog query. This is consistent with Phase 6: there is no secure purchase-order / receipt queue or transactional manual-approval workflow yet.

The wallet controller continues to read only the authenticated user's own wallet and ledger rows. Purchases, subscription activation, creator earnings, withdrawals and gifts remain disabled. No client-side credit, debit, or approval was added.

## 3. Required bank-transfer payment design (not deployed)

Before implementation, the backend must provide a coherent, auditable lifecycle:

1. **Product/order quote:** server calculates the product, price, currency (NGN where applicable), user, and immutable order reference. Client cannot set the amount to be credited.
2. **Payment submission:** signed-in user submits transfer reference, amount claimed, timestamp, and receipt evidence. Receipt access must be private and user-scoped.
3. **Pending verification:** submission creates a pending payment record; it does not activate a purchase or change wallet balances.
4. **Owner review:** only `eletexjoeytex@gmail.com` can approve/reject. The server verifies order ownership, exact amount/currency, evidence, status and duplicate references.
5. **Atomic settlement:** one server-side transaction locks the pending record, checks it has not been processed, records an immutable approval audit event, writes exactly one ledger credit/entitlement, updates the order, and commits. Repeated approval attempts must be idempotent.
6. **User result:** UI reports pending/approved/rejected only from persisted server state. No success overlay or entitlement is shown before commit.
7. **Reconciliation:** owner can search by order/reference/user/status and review audit history; no destructive editing of ledger history.

The design must include unique constraints/idempotency keys, strict RLS, least-privilege grants, safe server-side authorization, receipt retention/access controls, and tests for duplicate submission, duplicate approval, wrong amount, wrong owner, concurrent approvals, rejected payments and unauthorized reads/writes. Any privileged database function must be tightly scoped, explicitly revoke default public execute grants, and verify the authenticated actor rather than trusting client-supplied email or user metadata.

## 4. Transfer destination and support contact

The number `09159096952` was previously supplied as the SPIKE WhatsApp contact. It is **not** treated as a bank account number or payment destination. Do not instruct customers to transfer money to it.

Payment implementation is blocked until the owner provides the exact bank name, account name, account number, and confirms which products/prices should be purchasable. The destination must be displayed from trusted configuration, not typed by a customer or inferred from a support phone number.

## 5. Admin ownership

Preserve the existing single-owner restriction. `eletexjoeytex@gmail.com` remains the only designated admin owner. Do not grant admin to another account, and do not rely on frontend-only hiding: all future approval actions must enforce owner authorization server-side and record the acting auth user ID.

## 6. Verification boundary

- Live project status checked: `ACTIVE_HEALTHY`.
- Remote migration list checked: 18 versions.
- Local migration SQL count: 3.
- Targeted live financial table/column catalog query completed.
- No production writes or deployments performed.
- Browser payment E2E testing cannot begin until the backend workflow and real transfer destination are configured.

## 7. Next gated actions

1. Recover complete migration history on a trusted CLI environment.
2. Confirm the bank-transfer destination and product/price catalogue.
3. Design and test payment schema/RLS/atomic approval in a development branch or local database.
4. Run security advisors and two-user/owner authorization tests.
5. Only then deploy the payment workflow and connect wallet/admin UI.
