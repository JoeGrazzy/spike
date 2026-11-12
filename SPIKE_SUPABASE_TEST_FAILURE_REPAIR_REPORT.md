# SPIKE 3.0 — Supabase Source/Test Failure Repair

**Date:** 2026-10-23  
**Scope:** Repair the five failures caused by source files missing from the supplied archive. No production deployment or database changes were made.

## Root cause

The original archive omitted three Edge Function entrypoints and one candidate authorization helper even though the protected-baseline manifest and audit tests referenced them. This caused module-load failures in the admin and Safety Center tests and caused the protected-baseline integrity test to report missing files.

## Repairs

- Restored `supabase/functions/admin-user-ops/index.ts` using the active SPIKE project's deployed function source and retained user authentication, super-admin authorization, and audit logging for global sign-out.
- Restored `supabase/functions/admin-register-user/index.ts` using the active deployed source, retaining super-admin-only account creation and input validation.
- Restored `supabase/functions/spike-webauthn/index.ts` using the active deployed source, retaining origin/RP checks, authenticated-user binding, expiring challenges, and attempt rate limits.
- Recreated `supabase/edge-function-candidates/spike-predictor-sync/authorization-helper.ts` as a **candidate-only** helper. It does not trust public anon/publishable keys as privileged authorization. It is not deployed, and the existing review warning remains: confirm the scheduled caller contract and configure a separate high-entropy secret before any rollout.
- Updated only the four corresponding entries in `js/audit/protected-baseline.json` to record the recovered source files. All other manifest entries were left unchanged. This is a documented baseline recovery because the archive did not contain the files whose old hashes were recorded.

## Verification

- `npm run check`: **passed**.
- Automated suite: **553 passed, 0 failed, 1 skipped** (554 tests reported).
- ZIP archive integrity: verified after packaging.

## Production safety

No Edge Function was deployed or overwritten. No SQL migration, database write, auth setting, secret, or production configuration was changed. The restored entrypoints are included in the downloadable source package only. The candidate predictor-sync authorization helper is not a deployed function and must not be treated as approved for rollout.
