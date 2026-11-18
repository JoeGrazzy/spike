-- Agora calling compatibility migration for the existing SPIKE schema.
-- Keeps the deployed recipient_id column; does not rename or delete call data.
alter table public.spike_calls
  add column if not exists ringing_expires_at timestamptz not null default (now() + interval '45 seconds'),
  add column if not exists connected_at timestamptz,
  add column if not exists ended_by uuid references auth.users(id) on delete set null,
  add column if not exists end_reason text,
  add column if not exists duration_seconds integer not null default 0;

alter table public.spike_calls drop constraint if exists spike_calls_status_check;
alter table public.spike_calls add constraint spike_calls_status_check
  check (status in ('ringing','accepted','connected','ended','rejected','missed','cancelled','failed'));
alter table public.spike_calls drop constraint if exists spike_calls_terminal_timestamp;
alter table public.spike_calls add constraint spike_calls_terminal_timestamp
  check (ended_at is null or status in ('ended','rejected','missed','cancelled','failed'));
alter table public.spike_calls drop constraint if exists spike_calls_end_reason_check;
alter table public.spike_calls add constraint spike_calls_end_reason_check
  check (end_reason is null or end_reason in ('completed','rejected','no_answer','caller_cancelled','participant_ended','connection_failed','moderation'));
alter table public.spike_calls drop constraint if exists spike_calls_duration_seconds_check;
alter table public.spike_calls add constraint spike_calls_duration_seconds_check check (duration_seconds >= 0);

create table if not exists public.spike_call_participants (
  call_id uuid not null references public.spike_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('caller','callee')),
  joined_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz,
  primary key (call_id,user_id)
);

insert into public.spike_call_participants(call_id,user_id,participant_role)
select id, caller_id, 'caller' from public.spike_calls
on conflict (call_id,user_id) do nothing;
insert into public.spike_call_participants(call_id,user_id,participant_role)
select id, recipient_id, 'callee' from public.spike_calls
on conflict (call_id,user_id) do nothing;
update public.spike_call_participants p
set left_at = coalesce(p.left_at, c.ended_at, now())
from public.spike_calls c
where c.id=p.call_id and c.status in ('ended','rejected','missed','cancelled','failed') and p.left_at is null;

create index if not exists spike_calls_status_expiry_idx
  on public.spike_calls(status,ringing_expires_at) where status='ringing';
create index if not exists spike_call_participants_user_call_idx
  on public.spike_call_participants(user_id,call_id);
create unique index if not exists spike_call_one_active_call_per_user_uq
  on public.spike_call_participants(user_id) where left_at is null;

alter table public.spike_calls enable row level security;
alter table public.spike_call_participants enable row level security;
revoke all on table public.spike_call_participants from anon,authenticated;
grant select on table public.spike_call_participants to authenticated;
drop policy if exists spike_call_participants_self_read on public.spike_call_participants;
create policy spike_call_participants_self_read on public.spike_call_participants
  for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.spike_create_call(p_callee_id uuid,p_call_type text)
returns public.spike_calls language plpgsql security definer set search_path=''
as $function$
declare
  v_caller_id uuid := auth.uid(); v_call public.spike_calls; v_restricted_count integer;
begin
  if v_caller_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_callee_id is null or p_callee_id=v_caller_id then raise exception 'Choose another SPIKE member' using errcode='22023'; end if;
  if p_call_type is null or p_call_type not in ('voice','video') then raise exception 'Unsupported call type' using errcode='22023'; end if;
  if not public.can_message_spike_user(v_caller_id,p_callee_id) then raise exception 'This member is not available for calls' using errcode='42501'; end if;
  select count(*)::integer into v_restricted_count from public.profiles p
   where p.id in (v_caller_id,p_callee_id) and p.restricted_at is not null
   and (p.restricted_until is null or p.restricted_until>now());
  if v_restricted_count>0 then raise exception 'Calling is unavailable for this account' using errcode='42501'; end if;
  update public.spike_calls set status='missed',ended_at=coalesce(ended_at,now()),end_reason='no_answer'
   where status='ringing' and ringing_expires_at<=now();
  update public.spike_call_participants p set left_at=coalesce(p.left_at,now())
   from public.spike_calls c where p.call_id=c.id and p.left_at is null and c.status='missed';
  begin
    insert into public.spike_calls(caller_id,recipient_id,call_type,room_name,status,ringing_expires_at)
    values(v_caller_id,p_callee_id,p_call_type,'spike-'||gen_random_uuid()::text,'ringing',now()+interval '45 seconds') returning * into v_call;
    insert into public.spike_call_participants(call_id,user_id,participant_role)
    values(v_call.id,v_caller_id,'caller'),(v_call.id,p_callee_id,'callee');
  exception when unique_violation then raise exception 'You or this member is already on another call' using errcode='55P03';
  end;
  return v_call;
end;$function$;

create or replace function public.spike_respond_to_call(p_call_id uuid,p_action text)
returns public.spike_calls language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_call public.spike_calls; v_role text; v_reason text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_action not in ('accept','reject','cancel','end') then raise exception 'Unsupported call action' using errcode='22023'; end if;
  select participant_role into v_role from public.spike_call_participants
   where call_id=p_call_id and user_id=v_uid and left_at is null;
  if v_role is null then raise exception 'Call not found or access denied' using errcode='42501'; end if;
  select * into v_call from public.spike_calls where id=p_call_id for update;
  if not found then raise exception 'Call not found' using errcode='P0002'; end if;
  if v_call.status='ringing' and v_call.ringing_expires_at<=now() then
    update public.spike_calls set status='missed',ended_at=now(),end_reason='no_answer' where id=p_call_id returning * into v_call;
    update public.spike_call_participants set left_at=now() where call_id=p_call_id and left_at is null;
    return v_call;
  end if;
  if p_action='accept' then
    if v_role<>'callee' or v_call.status<>'ringing' then raise exception 'This call can no longer be accepted' using errcode='42501'; end if;
    update public.spike_calls set status='accepted',accepted_at=now() where id=p_call_id returning * into v_call;
    update public.spike_call_participants set joined_at=coalesce(joined_at,now()),last_seen_at=now() where call_id=p_call_id and user_id=v_uid;
  elsif p_action='reject' then
    if v_role<>'callee' or v_call.status<>'ringing' then raise exception 'This call can no longer be rejected' using errcode='42501'; end if;
    update public.spike_calls set status='rejected',ended_at=now(),ended_by=v_uid,end_reason='rejected' where id=p_call_id returning * into v_call;
    update public.spike_call_participants set left_at=now() where call_id=p_call_id and left_at is null;
  elsif p_action='cancel' then
    if v_role<>'caller' or v_call.status<>'ringing' then raise exception 'Only the caller can cancel a ringing call' using errcode='42501'; end if;
    update public.spike_calls set status='cancelled',ended_at=now(),ended_by=v_uid,end_reason='caller_cancelled' where id=p_call_id returning * into v_call;
    update public.spike_call_participants set left_at=now() where call_id=p_call_id and left_at is null;
  else
    if v_call.status not in ('ringing','accepted','connected') then return v_call; end if;
    v_reason:=case when v_call.connected_at is null then 'caller_cancelled' else 'participant_ended' end;
    update public.spike_calls set status='ended',ended_at=now(),ended_by=v_uid,end_reason=v_reason,
      duration_seconds=case when connected_at is null then 0 else greatest(0,floor(extract(epoch from(now()-connected_at)))::integer) end
      where id=p_call_id returning * into v_call;
    update public.spike_call_participants set left_at=now() where call_id=p_call_id and left_at is null;
  end if;
  return v_call;
end;$function$;

create or replace function public.spike_mark_call_connected(p_call_id uuid)
returns public.spike_calls language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_call public.spike_calls;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.spike_call_participants where call_id=p_call_id and user_id=v_uid and left_at is null)
    then raise exception 'Call not found or access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.spike_calls where id=p_call_id and status in ('accepted','connected'))
    then raise exception 'Call is not ready to connect' using errcode='55000'; end if;
  update public.spike_call_participants set joined_at=coalesce(joined_at,now()),last_seen_at=now() where call_id=p_call_id and user_id=v_uid;
  if (select count(*) from public.spike_call_participants where call_id=p_call_id and joined_at is not null and left_at is null)=2 then
    update public.spike_calls set status='connected',connected_at=coalesce(connected_at,now()) where id=p_call_id;
  end if;
  select * into v_call from public.spike_calls where id=p_call_id; return v_call;
end;$function$;

revoke all on function public.spike_create_call(uuid,text) from public,anon;
revoke all on function public.spike_respond_to_call(uuid,text) from public,anon;
revoke all on function public.spike_mark_call_connected(uuid) from public,anon;
grant execute on function public.spike_create_call(uuid,text) to authenticated;
grant execute on function public.spike_respond_to_call(uuid,text) to authenticated;
grant execute on function public.spike_mark_call_connected(uuid) to authenticated;

drop policy if exists spike_users_receive_own_call_broadcasts on realtime.messages;
create policy spike_users_receive_own_call_broadcasts on realtime.messages for select to authenticated
using(extension='broadcast' and (select auth.uid()) is not null and topic='user:'||(select auth.uid())::text||':calls');
