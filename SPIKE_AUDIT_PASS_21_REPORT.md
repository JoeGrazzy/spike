# SPIKE Audit — Pass 21: Store and Payment Release Readiness

## Findings
- The room-store purchase path in the checked-in SQL intentionally requires `p_payment_method = 'whatsapp'` and says purchases must be verified by an administrator. The current room purchase UI describes contacting the buyer and manually verifying the bank transaction before approval. This is not a Paystack checkout path.
- The deployment manifest and Admin Edge Functions matrix list `spike-paystack-init` and `spike-paystack-verify`, but their source directories are not included in this archive. Their security and payment-verification logic cannot be audited or deployed from this source tree.
- The manifest versions differ from the Admin matrix for `admin-register-user` (manifest 35, Admin 36) and `admin-user-ops` (manifest 4, Admin 5). The newer version hashes/deployment state were not available to verify, so these metadata values were not silently changed.

## Recommendation
Treat the Paystack path and edge-function version/hash reconciliation as release blockers if those functions are intended to be live. Recover the exact deployed source or approved build artifacts, verify server-side transaction checks and idempotency, then reconcile versions/hashes from a trusted deployment record. No payment or wallet logic was modified in this pass.
