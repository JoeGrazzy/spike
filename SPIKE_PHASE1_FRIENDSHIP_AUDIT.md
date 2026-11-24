# SPIKE Friendship Audit — 24 November 2026

The QR-first friendship implementation has been checked against the connected Supabase project. The live RPC signatures are present, authenticated execution is granted, and anonymous execution is not granted for the friendship request RPCs.

The following production changes are already applied:

1. `spike_qr_friendship_system_v1`
2. `spike_friend_request_system_v1`
3. `spike_friend_request_pending_default_v1`
4. `spike_friend_request_rls_alignment_v1`

The `follows.status` default is `pending`. The RLS insert policy recognizes pending requests. The target-side update policy is restricted to incoming legacy/new pending requests.

Rollback-only SQL transaction tests passed for request creation, duplicate request handling, acceptance to two reciprocal accepted rows, decline, cancellation, unfriend, block, blocked-request rejection, and unblock.

Frontend validation: 43 tests passed, the message-page smoke test passed, and `npm run check` passed. The Profile Friends statistic was corrected to count mutual friendships instead of followers; Add is now a navigation action.

This audit does not claim physical device tests, two real signed-in account UI tests, or Cloudflare deployment. See `SPIKE_ENGINEERING_AUDIT_2026-11-24.md` for the full CSS, frontend, Supabase, security-advisor, and remaining-verification report.

Do not reapply these migrations; they are already deployed to the connected Supabase project.
