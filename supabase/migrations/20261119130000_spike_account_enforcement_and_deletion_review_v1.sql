-- SPIKE owner-only account enforcement: suspension, indefinite ban and deletion review.
-- Permanent erasure is intentionally NOT performed by this migration. It requires
-- a separately secured service-role cleanup workflow for Auth, Storage and retention.

alter table public.profiles
  drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active','suspended','banned','deletion_pending','deleted'));

alter table public.spike_admin_action_events
  drop constraint if exists spike_admin_action_events_action_check;
alter table public.spike_admin_action_events
  add constraint spike_admin_action_events_action_check
  check (action in ('account_suspended','account_reactivated','account_banned','account_deletion_requested'));

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
  v_action text;
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can manage accounts.';
  end if;
  if p_user_id is null
     or p_status not in ('active', 'suspended', 'banned')
     or v_reason is null
     or char_length(v_reason) < 3
     or char_length(v_reason) > 500 then
    raise exception 'A valid account, status and reason (3–500 characters) are required.';
  end if;

  select lower(u.email), p.account_status
    into v_email, v_old
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.id = p_user_id
   for update of p;

  if not found then raise exception 'Account not found.'; end if;
  if v_email = 'eletexjoeytex@gmail.com' then
    raise exception 'The SPIKE owner account cannot be suspended, banned or changed here.';
  end if;
  if v_old = 'deletion_pending' then
    raise exception 'This account is in deletion review and cannot be restored through ordinary status controls.';
  end if;
  if v_old = p_status then
    return jsonb_build_object('ok', true, 'unchanged', true, 'status', v_old);
  end if;

  update public.profiles
     set account_status = p_status,
         updated_at = now()
   where id = p_user_id;

  v_action := case
    when p_status = 'suspended' then 'account_suspended'
    when p_status = 'banned' then 'account_banned'
    else 'account_reactivated'
  end;
  insert into public.spike_admin_action_events(
    actor_id, target_user_id, action, reason, previous_status, new_status
  ) values (auth.uid(), p_user_id, v_action, v_reason, v_old, p_status);

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$function$;
revoke all on function public.spike_admin_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.spike_admin_set_account_status(uuid, text, text) to authenticated;

create table if not exists public.spike_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','approved_for_erasure','cancelled','completed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  completion_note text
);
create unique index if not exists spike_account_deletion_one_pending_per_user
  on public.spike_account_deletion_requests(target_user_id) where status = 'pending';
create index if not exists spike_account_deletion_requests_created_idx
  on public.spike_account_deletion_requests(created_at desc);
alter table public.spike_account_deletion_requests enable row level security;
revoke all on public.spike_account_deletion_requests from public, anon, authenticated;

create or replace function public.spike_admin_request_account_deletion(
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare
  v_email text;
  v_old text;
  v_reason text := nullif(btrim(p_reason), '');
  v_request_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can request account deletion.';
  end if;
  if p_user_id is null or v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'A valid account and reason (5–500 characters) are required.';
  end if;
  select lower(u.email), p.account_status into v_email, v_old
    from auth.users u join public.profiles p on p.id = u.id
   where u.id = p_user_id for update of p;
  if not found then raise exception 'Account not found.'; end if;
  if v_email = 'eletexjoeytex@gmail.com' then raise exception 'The SPIKE owner account cannot be deleted.'; end if;
  if v_old = 'deletion_pending' then return jsonb_build_object('ok',true,'unchanged',true,'status',v_old); end if;

  insert into public.spike_account_deletion_requests(actor_id,target_user_id,reason)
  values(auth.uid(),p_user_id,v_reason) returning id into v_request_id;

  update public.profiles set account_status='deletion_pending', updated_at=now()
   where id=p_user_id;

  insert into public.spike_admin_action_events(actor_id,target_user_id,action,reason,previous_status,new_status)
  values(auth.uid(),p_user_id,'account_deletion_requested',v_reason,v_old,'deletion_pending');

  return jsonb_build_object('ok',true,'status','deletion_pending','request_id',v_request_id,
    'permanent_erasure',false,'message','Deletion review recorded. Permanent erasure requires the secured cleanup workflow.');
end;
$function$;
revoke all on function public.spike_admin_request_account_deletion(uuid,text) from public, anon;
grant execute on function public.spike_admin_request_account_deletion(uuid,text) to authenticated;
