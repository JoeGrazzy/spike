# SPIKE backend language migration

The language system now uses Supabase `public.spike_i18n_packs` as its source of truth and `public.user_app_settings.language_code` for the signed-in user preference.

1. Run `supabase/migrations/20260914000000_seed_spike_i18n_packs.sql` in the Supabase SQL Editor once.
2. Deploy SPIKE from the root with `npx wrangler deploy`.
3. Do not delete the Supabase language table; GitHub files are only application code/reference data.

The browser still keeps localStorage/cookie as an offline fallback for the selected language.
