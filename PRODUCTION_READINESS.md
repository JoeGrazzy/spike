# SPIKE Production Readiness

## Applied in Supabase

- Closed the cross-user `spike_record_activity_for_user(uuid)` authorization gap: callers can only update their own streak.
- Room reward leaderboard, VIP status, and gift-recipient RPCs now require room membership.
- Coin and premium-style room purchases now require room membership before charging the wallet.
- New public-schema functions default to no EXECUTE grant for `anon`/`public`.
- Optimized remaining RLS policies that directly evaluated `auth.uid()` per row.
- Added missing foreign-key workload indexes identified by the Supabase performance advisor.

## Verified

- Supabase migration application succeeded for both hardening migrations.
- Anonymous EXECUTE grants remain revoked.
- Existing RLS protections remain enabled; this hardening does not disable RLS.

## Still required before public launch

1. Resolve the Supabase Auth `auth_leaked_password_protection` warning in the project Auth settings.
2. Refactor intentional user-facing `SECURITY DEFINER` RPCs out of the exposed `public` API surface, or explicitly document and test them as approved exceptions. The current linter warns because many SPIKE RPCs are intentionally SECURITY DEFINER and callable by authenticated users.
3. Validate Cloudflare deployment configuration and headers (CSP/HSTS/cache) against the production zone.
4. Lock down Cloudinary upload presets and enforce server-side MIME/size limits.
5. Restrict Edge Function CORS to SPIKE production origins.
6. Run real-device/browser smoke tests for authentication, feed, stories, DMs, calls, rooms, uploads, payments, notifications, and account deletion.
7. Establish backup/restore and incident-response runbooks.
8. Reconcile the repository migration history with the live Supabase history; the live project contains substantially more historical migrations than the supplied ZIP.

## Important

The Supabase database is the live production authority. These repository migrations document the hardening applied during this production-readiness pass; they do not replace the missing historical migration chain.
