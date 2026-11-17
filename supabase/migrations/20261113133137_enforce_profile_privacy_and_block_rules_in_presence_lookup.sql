create or replace function public.spike_get_user_presence(p_user_ids uuid[])
returns table(user_id uuid, online boolean, last_seen timestamptz)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'auth'
as $function$
  select
    up.user_id,
    (up.last_seen >= now() - interval '90 seconds') as online,
    up.last_seen
  from public.user_presence up
  where (select auth.uid()) is not null
    and cardinality(coalesce(p_user_ids, '{}'::uuid[])) <= 100
    and up.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and public.can_view_spike_online_status((select auth.uid()), up.user_id);
$function$;

revoke all on function public.spike_get_user_presence(uuid[]) from public, anon;
grant execute on function public.spike_get_user_presence(uuid[]) to authenticated;
