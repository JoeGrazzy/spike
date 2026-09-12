# SPIKE Safety Center — Supabase deployment

The browser error `PGRST202` for `spike_register_safety_code(p_code)` means the connected Supabase database does not currently expose that RPC through PostgREST. A ZIP cannot execute SQL against a private Supabase project.

## Required order

1. Open the SQL Editor of the exact Supabase project used by SPIKE.
2. Run the complete `supabase/SPIKE_SAFETY_ALL_INSTALL.sql` file.
3. Verify the query in `supabase/SPIKE_SAFETY_DEPLOYMENT.sql` returns the expected functions.
4. Deploy `supabase/functions/spike-webauthn`.
5. Set Edge Function secrets:
   - `SPIKE_WEBAUTHN_ORIGINS` = comma-separated exact allowed app origins, e.g. `http://localhost:7700,https://your-production-origin.example`
   - `SPIKE_WEBAUTHN_RP_ID` = the exact production WebAuthn RP ID, normally the app hostname.
8. Reload SPIKE with a fresh browser session.

## Immediate Safety Code verification

This query must return one row:

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='spike_register_safety_code';
```

Expected:

`public | spike_register_safety_code | p_code text`

Do not create a client-side fallback that pretends a Safety Code was registered. The server must remain authoritative.
