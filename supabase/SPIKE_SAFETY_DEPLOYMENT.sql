-- SPIKE Safety Center: single deployment verification query.
-- Run the complete supabase/SPIKE_SAFETY_ALL_INSTALL.sql file first.

select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'spike_register_safety_code',
    'admin_verify_safety_code',
    'admin_issue_safety_recovery',
    'spike_consume_safety_recovery',
    'spike_set_trusted_contacts',
    'spike_get_trusted_contacts'
  )
order by p.proname;
