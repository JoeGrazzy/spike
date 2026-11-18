# SPIKE Phase 12 — payment settlement hardening

## Live Supabase changes

Applied migration `20261118230538_secure_purchase_event_reads_and_index_purchase_foreign_keys` to project `veagqanfilmbchlvlpcc`.

- Added an authenticated SELECT policy for `spike_purchase_events` that allows only the owner of the related purchase order or the SPIKE owner (`private.is_admin()`).
- Granted authenticated SELECT on the event table; RLS remains enabled and controls row visibility.
- Added indexes for purchase-event actor, purchase-order reviewer, and subscription last-order foreign keys.
- Verified the new policy is present after migration.

## Frontend correction

The admin purchase controller previously awaited the Supabase RPC result without inspecting its `{ data, error }` response. Supabase JS can resolve the promise with an `error` field instead of throwing. The UI now:

- checks and throws RPC errors for approval and rejection;
- requires `{ ok: true, status: 'approved' }` before reporting settlement success;
- requires `{ ok: true, status: 'rejected' }` before reporting rejection success;
- refreshes the queue only after server-confirmed results.

Customer-side code remains unable to approve purchases or write wallet balances. Approval remains owner-only and must include a bank transaction reference.

## Verification

- `npm run check:javascript` passed.
- `npm test` passed: 99 tests, 0 failures.
- Live database inspection confirmed the owner-only admin check and the purchase event read policy.
- Security advisor still reports seven authenticated-callable SECURITY DEFINER purchase RPCs. The admin RPCs contain `private.is_admin()` checks; customer RPCs validate `auth.uid()` and order ownership. They were not indiscriminately revoked because the customer purchase flow and owner admin UI require authenticated RPC access.
- Leaked-password protection remains disabled in Supabase Auth and requires a dashboard-level setting change.

## Not yet verified

No real bank transfer was initiated, no customer order was approved, and no wallet balance or subscription was changed during testing. A live browser/mobile end-to-end test using a customer account and the owner account is still required. The source tests do not replace that test.
