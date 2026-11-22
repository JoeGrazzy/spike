create or replace function public.spike_admin_get_suspension_history(p_user_id uuid, p_limit integer default 50)
returns table(
  id uuid,
  event_type text,
  reason text,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  actor_id uuid,
  actor_email text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can inspect suspension history.';
  end if;
  if p_user_id is null then
    raise exception 'A target account is required.';
  end if;
  return query
    select e.id,e.event_type,e.reason,e.started_at,e.expires_at,e.created_at,e.actor_id,
           case when e.actor_id is null then 'SYSTEM (automatic)' else coalesce(u.email,'Administrator') end
    from public.spike_account_suspension_events e
    left join auth.users u on u.id=e.actor_id
    where e.target_user_id=p_user_id
    order by e.created_at desc
    limit greatest(1,least(coalesce(p_limit,50),100));
end;
$function$;
revoke all on function public.spike_admin_get_suspension_history(uuid,integer) from public, anon;
grant execute on function public.spike_admin_get_suspension_history(uuid,integer) to authenticated;
