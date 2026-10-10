# SPIKE Edge Function Administration — 2026-10-08

This package records the live Edge Function authorization review performed against Supabase project `cjqpyndceqyqsijihxbb`.

## Authorization rule

Administrative access is explicit and server-side. JWT validation is not disabled merely to make an administrator call succeed. Functions that represent a user's private identity remain user-bound.

## Live deployment matrix

| Function | Version | JWT | Administrative authority |
|---|---:|---|---|
| create-private-call | 37 | required | User-bound; friendship/call rules remain authoritative |
| spike-predictor-sync | 41 | handler-authorized | Internal API key OR admin/super-admin |
| admin-register-user | 35 | required | Super-admin |
| spike-media-download | 36 | required | Authenticated user; Cloudinary allowlist retained |
| spike-paystack-init | 36 | required | Authenticated user; admin/super-admin administrative email override |
| spike-b2-media | 38 | required | User ownership; admin/super-admin override for private message media |
| spike-webauthn | 27 | required | User-bound passkey ownership |
| spike-paystack-verify | 2 | required | Authenticated user |
| admin-user-ops | 4 | required | Super-admin |

## Changes deployed in this pass

- `spike-media-download`: validates the actual Supabase user instead of treating a bearer-header-shaped value as authentication.
- `spike-paystack-init`: validates the actual Supabase user and prevents ordinary users from initializing a transaction against another account's email.
- `spike-paystack-verify`: validates the actual Supabase user before Paystack verification.
- `spike-b2-media`: permits administrator access to private-message media while retaining ownership checks for ordinary users.
- `spike-predictor-sync`: retains its internal API-key path and its explicit signed-in admin/super-admin path.

## Intentionally not bypassed

`create-private-call` and `spike-webauthn` are identity-bound operations. An administrator should not be able to impersonate another user's call identity or passkey credentials simply because they have administrative privileges.

## Security advisor status

The Supabase security advisor still reports pre-existing database-level findings, including SECURITY DEFINER execute warnings and disabled leaked-password protection. These were not silently reclassified as resolved by this Edge Function work.

## Package note

`admin.html` is intentionally modified for the current admin control-center work. The existing `protected-baseline.json` remains unchanged, so its protection test correctly reports the intentional admin.html hash difference.
