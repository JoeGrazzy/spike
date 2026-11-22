-- Owner-only account suspension/reactivation with immutable audit history.
create table if not exists public.spike_admin_action_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  action text not null check (action in ('account_suspended','account_reactivated')),
  reason text not null,
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now()
);

alter table public.spike_admin_action_events enable row level security;
revoke all on public.spike_admin_action_events from anon, authenticated;

create or replace function public.spike_admin_set_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare
  v_old text;
  v_email text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can manage accounts.';
  end if;
  if p_user_id is null
     or p_status not in ('active', 'suspended')
     or v_reason is null
     or char_length(v_reason) > 500 then
    raise exception 'A valid account, status and reason (maximum 500 characters) are required.';
  end if;

  select lower(u.email), p.account_status
    into v_email, v_old
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.id = p_user_id
   for update of p;

  if not found then raise exception 'Account not found.'; end if;
  if v_email = 'eletexjoeytex@gmail.com' then
    raise exception 'The SPIKE owner account cannot be suspended or changed here.';
  end if;

  if v_old = p_status then
    return jsonb_build_object('ok', true, 'unchanged', true, 'status', v_old);
  end if;

  update public.profiles
     set account_status = p_status, updated_at = now()
   where id = p_user_id;

  insert into public.spike_admin_action_events(
    actor_id, target_user_id, action, reason, previous_status, new_status
  ) values (
    auth.uid(), p_user_id,
    case when p_status = 'suspended' then 'account_suspended' else 'account_reactivated' end,
    v_reason, v_old, p_status
  );

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$function$;

revoke all on function public.spike_admin_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.spike_admin_set_account_status(uuid, text, text) to authenticated;


create or replace function public.spike_admin_get_account_actions(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, private
as $function$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can inspect admin account history.';
  end if;
  if p_user_id is null then raise exception 'An account is required.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'action', e.action, 'reason', e.reason,
      'previous_status', e.previous_status, 'new_status', e.new_status,
      'created_at', e.created_at
    ) order by e.created_at desc)
    from (
      select * from public.spike_admin_action_events
       where target_user_id = p_user_id
       order by created_at desc limit 50
    ) e
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.spike_admin_get_account_actions(uuid) from public, anon;
grant execute on function public.spike_admin_get_account_actions(uuid) to authenticated;

-- Cover the audit log's foreign keys and the account-history lookup.
create index if not exists spike_admin_action_events_actor_id_idx
  on public.spike_admin_action_events(actor_id);
create index if not exists spike_admin_action_events_target_user_id_created_at_idx
  on public.spike_admin_action_events(target_user_id, created_at desc);
