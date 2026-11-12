# SPIKE Admin repair pass — 11 November 2026

## Source
Based on `SPIKE_ADMIN_COMMAND_CENTER_V2.zip` (the newest SPIKE admin archive found in the Library at the time of this repair).

## Changes made

1. **User directory Edge Function**
   - Removed the unnecessary Auth `listUsers()` prefetch and the first-1,000-user ID filter.
   - The directory now relies on the paginated `admin_list_users_v2` RPC result, so accounts beyond the first Auth page are not silently dropped.
   - Returns structured Postgres error metadata to the UI and validates the RPC response shape.
2. **Admin request handling**
   - Checks session retrieval errors and missing/expired access tokens.
   - Handles non-JSON Edge Function responses safely and reports the HTTP status instead of masking the underlying failure.
   - Disables caching for the admin request.
3. **User directory UI**
   - Shows the real failure reason, preserves the distinction between failure and an empty result, and provides a retry action.
   - Keeps pagination based on a 51-row fetch (50 visible + 1 next-page probe).
   - Wraps row actions so they can flow on narrow screens.
4. **Account activation**
   - Rebuilt the form with independent, full-width fields and a properly aligned checkbox row.
   - Changed the reason field to a multiline textarea and added pending/success/error feedback.
   - Added a new migration that corrects the later migration's activation regression: activation now updates `profiles.activated` and writes an audit record; it no longer calls ban/unban operations.
5. **Mobile header**
   - Uses a predictable three-row mobile grid for back/menu/brand/badge, identity, and the Refresh/Sign out/Exit actions.
   - Prevents the Exit action from being stranded on an extra line.

## Verification performed

- JavaScript syntax check: `node --check` passed for the combined inline scripts in `admin.html`.
- CSS brace-balance checks passed for the admin command-center and responsive stylesheets.
- Duplicate static HTML IDs: none found (the only duplicate-like strings were template interpolation fragments).
- ZIP integrity check passed (`testzip()` returned no corrupt entry).
- Confirmed the archive contains the updated `admin.html`, admin CSS, Edge Function source, and new SQL migration.

## Required deployment / live verification

This archive does **not** deploy code to the live Supabase project. To activate the backend fixes, deploy the updated `admin-user-ops` Edge Function and apply the new migration `supabase/migrations/20261111220000_fix_admin_user_directory_activation.sql` using the project's normal Supabase migration/deployment workflow.

A live authenticated request against the user's Supabase project was not possible in this repair environment. Therefore the archive is statically validated, but the user directory and activation action still require post-deployment verification with a super-admin session.

## Scope

This is a targeted repair of the visible user-directory, account-activation, and mobile-header defects. The archive contains 18 admin sections, but this pass does not certify every feature in all 18 sections end-to-end.
