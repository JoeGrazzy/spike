# SPIKE Phase 8 — manual payment gateway

## Live workflow

- The wallet page loads the server-published product catalogue and the authenticated customer's own purchase history through PostgreSQL RPCs.
- SP Coin and Verified purchase requests use the same server-side order creation RPC. The browser sends only a SKU and idempotency key; price, coin quantity, duration, ownership and status are taken from the trusted server catalogue and order snapshot.
- The server returns the order ID/reference before the browser opens WhatsApp click-to-chat to `09159096952` (international form `2349159096952`). The customer taps Send; SPIKE support then supplies the verified bank transfer instructions manually.
- Customer payment reporting changes the order to `payment_reported`; it is not proof of payment and cannot credit coins or activate a subscription.
- The owner payment centre calls the server-side list, approve and reject RPCs. Approval requires a bank transaction reference and the owner must independently check the bank statement.
- The existing wallet account and ledger reader remains read-only. No browser code performs financial mutations.

## Deployed RPC contract

| RPC | Purpose |
|---|---|
| `spike_get_purchase_catalog()` | Returns active server-published products. |
| `spike_create_purchase_order(p_sku text, p_idempotency_key text)` | Derives `auth.uid()`, snapshots the trusted SKU and price, and creates an idempotent order. |
| `spike_my_purchase_orders()` | Returns only the caller's own order history. |
| `spike_report_purchase_payment(p_order_id uuid)` | Allows the owner of an order to report payment; does not settle it. |
| `spike_admin_list_purchase_orders()` | Owner-only purchase queue. |
| `spike_admin_approve_purchase(p_order_id uuid, p_payment_reference text)` | Owner-only transactional settlement, duplicate-reference protection, ledger/balance update for coin orders, or verified subscription activation. |
| `spike_admin_reject_purchase(p_order_id uuid, p_reason text)` | Owner-only rejection and audit event. |

## Security requirements retained

1. `auth.uid()` is the customer identity. Never trust browser-supplied user IDs, amount, currency, coin quantity, duration, or approval state.
2. Administrative RPCs must retain the explicit server-side `private.is_admin()` check, which verifies `eletexjoeytex@gmail.com` and an active admin profile.
3. Customer order reads are scoped to the caller. Direct browser updates to order status, price, wallet balance, ledger, or subscription state are not granted.
4. Approval locks the order, checks eligible state, rejects duplicate payment references, and uses a unique wallet-ledger reference for idempotency.
5. Payment reports and owner decisions are written to the server-side audit event table. It intentionally has no direct browser privileges.
6. Subscription duration and price come from the server-side catalogue and order snapshot.
7. Do not store bank details in browser code. `09159096952` is WhatsApp support, not a bank account.
8. Keep fixed `search_path` and explicit authorization checks on privileged functions. Review Security Advisor findings after changes.
9. Test owner/non-owner access, status transitions, duplicate approval, concurrent approval, price tampering, user-ID tampering, and atomic rollback before accepting real payments.

## Live catalogue snapshot

At the latest read-only inspection, the active catalogue contains Verified monthly (₦500, 30 days) and yearly (₦3,000, 365 days). No SP Coin product is currently active. Product display labels must be read from the RPC catalogue rather than trusted static frontend prices.

## Remaining operational checks

- Confirm the owner can open the purchase queue and review a test order in an authenticated browser session.
- Verify the customer WhatsApp handoff and order status transitions using a non-production test account.
- Do not treat source tests as proof of a live transfer or a real wallet settlement.
