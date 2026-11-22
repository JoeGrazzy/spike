create or replace function public.spike_admin_get_enforcement_dashboard(
  p_status text default 'all',
  p_search text default '',
  p_expiring_hours integer default 72,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can inspect enforcement records.';
  end if;
  if p_status not in ('all','suspended','banned','active') then
    raise exception 'Invalid account status filter.';
  end if;
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'suspended', (select count(*) from public.profiles where account_status='suspended'),
      'expiring_soon', (select count(*) from public.profiles where account_status='suspended' and suspension_expires_at>now() and suspension_expires_at<=now()+make_interval(hours=>greatest(1,least(coalesce(p_expiring_hours,72),720)))),
      'expired_pending', (select count(*) from public.profiles where account_status='suspended' and suspension_expires_at is not null and suspension_expires_at<=now()),
      'banned', (select count(*) from public.profiles where account_status='banned'),
      'active', (select count(*) from public.profiles where account_status='active')
    ),
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.sort_at desc) from (
        select p.id,p.username,p.display_name,p.spike_id,p.account_status,p.created_at,
          p.suspension_started_at,p.suspension_expires_at,p.suspension_reason,
          (p.account_status='suspended' and p.suspension_expires_at<=now()) as expiry_processing_overdue,
          coalesce(p.suspension_expires_at,p.updated_at,p.created_at) as sort_at
        from public.profiles p
        where (p_status='all' or p.account_status=p_status)
          and (nullif(trim(p_search),'') is null
            or coalesce(p.username,'') ilike '%'||trim(p_search)||'%'
            or coalesce(p.display_name,'') ilike '%'||trim(p_search)||'%'
            or coalesce(p.spike_id,'') ilike '%'||trim(p_search)||'%')
        order by coalesce(p.suspension_expires_at,p.updated_at,p.created_at) desc
        limit greatest(1,least(coalesce(p_limit,100),250))
      ) q
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.spike_admin_get_enforcement_dashboard(text,text,integer,integer) from public, anon;
grant execute on function public.spike_admin_get_enforcement_dashboard(text,text,integer,integer) to authenticated;
