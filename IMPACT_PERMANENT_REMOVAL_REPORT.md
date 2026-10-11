# SPIKE Impact Feature Retirement

## Scope
- Removed the active Impact payment/payout/admin Edge Function source directories.
- Removed obsolete audit tests that required the retired Impact page and services to exist.
- Added regression tests that assert the page/functions stay absent, the forward database retirement migration remains present, and later migrations do not recreate Impact database objects.
- Preserved historical migrations as immutable history. They are not active application routes or deployed Edge Function source.

## Database/deployment note
The forward migration `supabase/migrations/20261010192200_spike_remove_impact_feature.sql` must be applied to each deployed Supabase environment. This repository change alone does not alter a remote database or remove already-deployed Edge Functions. Before applying the migration, confirm that Impact-only data is no longer needed; the migration is destructive to Impact-owned tables.

## Verification
Run `npm run check`. A full passing result still depends on unrelated pre-existing Story/protected-baseline failures being resolved separately. Do not regenerate the protected baseline to mask changes.
