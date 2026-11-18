# SPIKE — Full project and backend inspection

**Inspection date:** 18 November 2026  
**Scope:** Current delivered source archive, static integrity checks, regression tests, and connected Supabase project `veagqanfilmbchlvlpcc`.

## Overall result

The project is internally consistent under its automated source checks, and the live Supabase database has RLS enabled across every public application table. The single-owner admin restriction is active in the database and represented in the source package. The inspection also identified several remaining production-readiness tasks; this is not a claim that the app has passed real-device or browser end-to-end testing.

## Verified

- 66/66 automated tests pass; JavaScript syntax checks pass.
- Every local CSS/JS reference resolves; HTML IDs and local asset references pass the source-integrity suite.
- No Supabase service-role/secret key was found in browser source. The browser uses the publishable key.
- 23/23 public application tables have RLS enabled, with 91 public policies.
- Four compatibility views use `security_invoker=true`; anonymous SELECT is not granted on those views.
- Four Storage buckets exist: public `avatars`; private `post-media`, `chat-attachments`, `room-media`. Ownership/member policies are present, plus the MFA restrictive Storage policy.
- 13 application tables are in `supabase_realtime`.
- Exactly one live profile has an elevated `admin`/`moderator` role: `eletexjoeytex@gmail.com` (active `admin`). Database `private.is_admin()` checks auth email, profile role and account status.
- Admin shell now remains hidden until the shared auth guard authorizes the page; controller independently verifies owner identity. Verification and purchases sections remain disabled until supported workflows exist.
- Wallet is read-only; referral rewards, payments/payouts, verification and unsupported metrics are not simulated.

## Findings requiring owner action

| Priority | Finding | Required action |
|---|---|---|
| High | Zero verified MFA factors currently exist. MFA protection is opt-in until enrollment. | Enroll an authenticator on the owner account and save recovery codes. Consider enforcing AAL2 for admin actions after enrollment. |
| High | Supabase Auth leaked-password protection is disabled. | Enable it in Supabase Dashboard → Authentication → Settings → Password Security. |
| High | No browser/device E2E or signed-in owner moderation test has been run. | Test sign-in, MFA enrollment/challenge, admin overview, user directory and report status update on a staging deployment with at least two accounts. |
| Medium | CSP is report-only. | Review real browser violation reports, then stage an enforced CSP without breaking inline code or required providers. |
| Medium | First 15 historical migration SQL bodies are unavailable locally. | Recover a canonical migration baseline with an authenticated Supabase CLI `db pull`; do not replay the partial folder. |
| Medium | Production Auth SMTP/OAuth/redirect settings and hosting deployment state are not verified. | Review Dashboard Auth providers, SMTP, redirect allow-list, and hosting deployment configuration. |
| Medium | Cloudinary unsigned preset was supplied, but its server-side restrictions are not verifiable from this project. | In Cloudinary Console restrict allowed formats, size, folders/transformations and abuse exposure; never put API secret in browser. |
| Low | Performance Advisor lists 38 unused indexes. | Reassess after real workload; do not remove solely on this early signal. |

## Live data limits

Current live counts: one profile, one wallet account, zero posts, messages, notifications, rooms and wallet-ledger entries. The lack of real records prevents meaningful load, concurrency, multi-user and end-to-end validation.

## Feature readiness

- Connected: auth/session guards, profile settings, feed publishing and social actions, messaging, notifications, rooms, read-only wallet, reports moderation, account directory.
- Intentionally limited: user directory is read-only; verification and purchases tabs are disabled; referrals do not promise rewards; wallet does not create/settle money; voice/video calling is not implemented; voice-note UI is not claimed as backend-operational.

## Packaging correction made during inspection

The previous regression test referred to the wrong timestamp for the already deployed single-owner migration. It now points to `supabase/migrations/20261118211133_spike_single_owner_admin_access.sql`. The admin page also conceals its shell until the common guard sets the authenticated-ready marker.

## Test command

```bash
npm run check
```

A passing source suite does not replace a real browser/device acceptance test or provider dashboard verification.
