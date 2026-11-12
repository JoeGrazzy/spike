# Candidate only — spike-predictor-sync authorization review

**Do not deploy this directory as-is.** The live v41 source was fetched read-only on 2026-10-11. No production setting or function was changed.

## Finding

The live function has `verify_jwt=false`. Its `allowedCaller()` first returns `true` when `allowedApiKey(req)` succeeds. `allowedApiKey()` accepts any value in `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, or `SUPABASE_PUBLISHABLE_KEYS`. These are public client keys, not a secret or administrator credential. A caller that knows the app's public key can therefore bypass the subsequent signed-in admin/super-admin role check and reach service-role writes to `spike_fixtures` and `spike_predictions`.

## Required safe authorization shape

- Remove the public Supabase API-key authorization path entirely.
- Keep the signed-in `admin` / `super_admin` path, validated by `auth.getUser()` and a server-side profile role lookup.
- If unattended scheduled sync is a real requirement, require a separate high-entropy secret stored only as `SPIKE_PREDICTOR_SYNC_SECRET`, supplied in a dedicated header such as `x-spike-predictor-secret`, compared server-side, and rotated independently of public Supabase keys. Never reuse anon/publishable/service-role keys as this secret.
- Keep CORS allow-headers aligned with the chosen secret header only if browser use is explicitly required. Prefer server-to-server invocation for scheduled sync.
- Before rollout, identify every caller and provision the dedicated secret; test missing/wrong secret (401), valid secret (allowed), non-admin user (401), admin (allowed), and OPTIONS preflight. Do not deploy until the caller contract is confirmed.

## Separate correctness concern

The live `makePred()` currently derives confidence and scores from string lengths and fixture ID length. It is deterministic placeholder logic, not a statistical prediction model. Do not describe the output as statistically validated. Determine product expectations before changing the prediction algorithm; this is distinct from the authorization fix.
