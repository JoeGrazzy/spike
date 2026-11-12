-- SPIKE admin repair: keep account activation independent from account restrictions.
-- The previous v3 migration incorrectly implemented activation through ban/unban RPCs.
create or replace function public.admin_set_user_activation(
  p_user_id uuid,
  p_activated boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'auth'
as $$
declare
  actor uuid := auth.uid();
  old_state jsonb;
  new_state jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'Super admin access required' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'User is required'; end if;

  select jsonb_build_object('activated', activated)
    into old_state
    from public.profiles
   where id = p_user_id
   for update;
  if old_state is null then raise exception 'SPIKE user not found'; end if;

  update public.profiles
     set activated = p_activated, updated_at = now()
   where id = p_user_id;

  new_state := jsonb_build_object('activated', p_activated);
  insert into public.spike_admin_audit_log(
    actor_id, action, target_type, target_id, reason, before_state, after_state
  ) values (
    actor, 'user_activation', 'user', p_user_id,
    left(nullif(btrim(coalesce(p_reason, '')), ''), 500), old_state, new_state
  );

  return jsonb_build_object(
    'ok', true, 'user_id', p_user_id, 'activated', p_activated
  );
end;
$$;
revoke all on function public.admin_set_user_activation(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_user_activation(uuid, boolean, text) to authenticated;
