-- SPIKE timed account suspensions: additive, owner-only, UTC timestamps.
-- Existing accounts and existing enforcement history are preserved.

alter table public.profiles
  add column if not exists suspension_started_at timestamptz,
  add column if not exists suspension_expires_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists suspension_issued_by uuid references auth.users(id);

create table if not exists public.spike_account_suspension_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id),
  actor_id uuid references auth.users(id),
  event_type text not null check (event_type in ('suspension_started','suspension_extended','suspension_restored','suspension_expired','suspension_converted_to_ban')),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists spike_account_suspension_events_target_created_idx
  on public.spike_account_suspension_events(target_user_id, created_at desc);
alter table public.spike_account_suspension_events enable row level security;
revoke all on public.spike_account_suspension_events from public, anon, authenticated;

-- Replace the old 3-argument function. Duration is mandatory for temporary suspension.
drop function if exists public.spike_admin_set_account_status(uuid,text,text);
create function public.spike_admin_set_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text,
  p_duration_hours integer default null
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
  v_started timestamptz;
  v_expires timestamptz;
begin
  if not private.is_admin() then raise exception 'Only the SPIKE owner can manage accounts.'; end if;
  if p_user_id is null or p_status is null or p_status not in ('active','suspended','banned')
     or v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'A valid account, status and reason (3–1000 characters) are required.';
  end if;
  if p_status = 'suspended' and (p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 720) then
    raise exception 'Temporary suspension must be between 1 and 720 hours.';
  end if;
  if p_status <> 'suspended' and p_duration_hours is not null then
    raise exception 'A duration is only valid for temporary suspension.';
  end if;

  select lower(u.email), p.account_status into v_email, v_old
  from auth.users u join public.profiles p on p.id=u.id
  where u.id=p_user_id for update of p;
  if not found then raise exception 'Account not found.'; end if;
  if v_email='eletexjoeytex@gmail.com' then raise exception 'The SPIKE owner account is protected.'; end if;
  if v_old='deletion_pending' then raise exception 'This account is in deletion review.'; end if;
  if v_old=p_status and p_status <> 'suspended' then
    return jsonb_build_object('ok',true,'unchanged',true,'status',v_old);
  end if;

  v_started := case when p_status='suspended' then now() else null end;
  v_expires := case when p_status='suspended' then now() + make_interval(hours => p_duration_hours) else null end;
  update public.profiles set
    account_status=p_status,
    suspension_started_at=v_started,
    suspension_expires_at=v_expires,
    suspension_reason=case when p_status='suspended' then v_reason else null end,
    suspension_issued_by=case when p_status='suspended' then auth.uid() else null end,
    updated_at=now()
  where id=p_user_id;

  v_action := case when p_status='suspended' then 'account_suspended'
                   when p_status='banned' then 'account_banned'
                   else 'account_reactivated' end;
  insert into public.spike_admin_action_events(actor_id,target_user_id,action,reason,previous_status,new_status)
  values(auth.uid(),p_user_id,v_action,v_reason,v_old,p_status);

  insert into public.spike_account_suspension_events(target_user_id,actor_id,event_type,reason,started_at,expires_at)
  values(p_user_id,auth.uid(),
    case when p_status='suspended' then 'suspension_started'
         when v_old='suspended' and p_status='banned' then 'suspension_converted_to_ban'
         when v_old='suspended' then 'suspension_restored'
         else 'suspension_started' end,
    v_reason,v_started,v_expires);

  return jsonb_build_object('ok',true,'status',p_status,'suspension_started_at',v_started,'suspension_expires_at',v_expires);
end;
$function$;
revoke all on function public.spike_admin_set_account_status(uuid,text,text,integer) from public, anon;
grant execute on function public.spike_admin_set_account_status(uuid,text,text,integer) to authenticated;

create or replace function public.spike_expire_account_suspensions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare r record; v_count integer := 0;
begin
  for r in
    select id, suspension_reason, suspension_started_at, suspension_expires_at
    from public.profiles
    where account_status='suspended'
      and suspension_expires_at is not null
      and suspension_expires_at <= now()
    for update skip locked
  loop
    update public.profiles set account_status='active',
      suspension_started_at=null,suspension_expires_at=null,
      suspension_reason=null,suspension_issued_by=null,updated_at=now()
    where id=r.id and account_status='suspended';
    if found then
      insert into public.spike_account_suspension_events(target_user_id,actor_id,event_type,reason,started_at,expires_at)
      values(r.id,null,'suspension_expired','Temporary suspension expired automatically',r.suspension_started_at,r.suspension_expires_at);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.spike_expire_account_suspensions() from public, anon, authenticated;

-- Install scheduler and run expiry every minute. The job only touches expired suspended rows.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname='spike-expire-account-suspensions';
select cron.schedule('spike-expire-account-suspensions','* * * * *',
  'select public.spike_expire_account_suspensions();');
