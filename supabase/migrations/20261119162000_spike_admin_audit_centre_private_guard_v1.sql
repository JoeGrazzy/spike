-- Keep the privileged implementation in the non-exposed private schema.
-- The public PostgREST RPC is SECURITY INVOKER and delegates to the guarded helper.
do $migration$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.spike_admin_get_audit_centre(text,text,integer,integer)'::regprocedure);
  v_definition := replace(v_definition, 'FUNCTION public.spike_admin_get_audit_centre', 'FUNCTION private.spike_admin_get_audit_centre_impl');
  execute v_definition;
end;
$migration$;
revoke all on function private.spike_admin_get_audit_centre_impl(text,text,integer,integer) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.spike_admin_get_audit_centre_impl(text,text,integer,integer) to authenticated;
create or replace function public.spike_admin_get_audit_centre(p_source text default 'all', p_search text default '', p_days integer default 90, p_limit integer default 100)
returns jsonb language sql security invoker set search_path = pg_catalog, private
as $function$ select private.spike_admin_get_audit_centre_impl(p_source,p_search,p_days,p_limit); $function$;
revoke all on function public.spike_admin_get_audit_centre(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.spike_admin_get_audit_centre(text,text,integer,integer) to authenticated;
