create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.spike_video_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null default 'video' check (call_type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','declined','ended','missed','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 seconds'),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  constraint spike_video_calls_not_self check (caller_id <> callee_id),
  constraint spike_video_calls_end_consistency check (status not in ('ended','declined','missed','failed') or ended_at is not null)
);
create index spike_video_calls_caller_active_idx on public.spike_video_calls (caller_id, created_at desc) where status in ('ringing','accepted');
create index spike_video_calls_callee_active_idx on public.spike_video_calls (callee_id, created_at desc) where status in ('ringing','accepted');

create table public.spike_video_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.spike_video_calls(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint spike_video_call_signal_payload_size check (octet_length(payload::text) <= 16384)
);
create index spike_video_call_signals_call_created_idx on public.spike_video_call_signals (call_id, created_at);

alter table public.spike_video_calls enable row level security;
alter table public.spike_video_call_signals enable row level security;
revoke all on public.spike_video_calls, public.spike_video_call_signals from anon, authenticated, public;
grant select on public.spike_video_calls to authenticated;
grant select, insert on public.spike_video_call_signals to authenticated;

create policy spike_video_calls_participant_read on public.spike_video_calls for select to authenticated
using ((select auth.uid()) = caller_id or (select auth.uid()) = callee_id);
create policy spike_video_call_signals_participant_read on public.spike_video_call_signals for select to authenticated
using (exists (select 1 from public.spike_video_calls c where c.id = call_id and ((select auth.uid()) = c.caller_id or (select auth.uid()) = c.callee_id)));
create policy spike_video_call_signals_participant_insert on public.spike_video_call_signals for insert to authenticated
with check (sender_id = (select auth.uid()) and exists (
  select 1 from public.spike_video_calls c where c.id = call_id and c.status in ('ringing','accepted')
  and ((select auth.uid()) = c.caller_id or (select auth.uid()) = c.callee_id)
));

create or replace function private.spike_video_call_start(p_callee_id uuid, p_call_type text default 'video') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_caller_id uuid := auth.uid(); v_first uuid; v_second uuid; v_call_id uuid;
begin
  if v_caller_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_callee_id is null or p_callee_id = v_caller_id then raise exception 'Invalid call recipient' using errcode = '22023'; end if;
  if p_call_type not in ('audio','video') then raise exception 'Invalid call type' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users u where u.id = p_callee_id) then raise exception 'Recipient not found' using errcode = '23503'; end if;
  v_first := least(v_caller_id, p_callee_id); v_second := greatest(v_caller_id, p_callee_id);
  perform pg_advisory_xact_lock(hashtextextended(v_first::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_second::text, 0));
  if exists (select 1 from public.spike_video_calls c where c.status in ('ringing','accepted')
    and (c.caller_id in (v_caller_id,p_callee_id) or c.callee_id in (v_caller_id,p_callee_id))) then
    raise exception 'One of these members is already in a call' using errcode = '55000';
  end if;
  insert into public.spike_video_calls(caller_id,callee_id,call_type) values (v_caller_id,p_callee_id,p_call_type) returning id into v_call_id;
  return v_call_id;
end; $$;

create or replace function private.spike_video_call_respond(p_call_id uuid, p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_callee_id uuid; v_status text; v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action not in ('accepted','declined') then raise exception 'Invalid response' using errcode = '22023'; end if;
  select c.callee_id,c.status,c.expires_at into v_callee_id,v_status,v_expires_at from public.spike_video_calls c where c.id=p_call_id for update;
  if not found then raise exception 'Call not found' using errcode = 'P0002'; end if;
  if v_callee_id <> auth.uid() then raise exception 'Only the invited member can answer this call' using errcode = '42501'; end if;
  if v_status <> 'ringing' then raise exception 'Call is no longer ringing' using errcode = '55000'; end if;
  if v_expires_at <= now() then update public.spike_video_calls set status='missed',ended_at=now() where id=p_call_id; return 'missed'; end if;
  update public.spike_video_calls set status=p_action,accepted_at=case when p_action='accepted' then now() else null end,
    ended_at=case when p_action='declined' then now() else null end,ended_by=case when p_action='declined' then auth.uid() else null end where id=p_call_id;
  return p_action;
end; $$;

create or replace function private.spike_video_call_end(p_call_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_caller_id uuid; v_callee_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select c.caller_id,c.callee_id,c.status into v_caller_id,v_callee_id,v_status from public.spike_video_calls c where c.id=p_call_id for update;
  if not found then raise exception 'Call not found' using errcode = 'P0002'; end if;
  if auth.uid() not in (v_caller_id,v_callee_id) then raise exception 'Not a call participant' using errcode = '42501'; end if;
  if v_status in ('ringing','accepted') then update public.spike_video_calls set status='ended',ended_at=now(),ended_by=auth.uid() where id=p_call_id; return 'ended'; end if;
  return v_status;
end; $$;

create or replace function public.spike_video_call_start(p_callee_id uuid, p_call_type text default 'video') returns uuid
language sql security invoker set search_path = '' as $$ select private.spike_video_call_start(p_callee_id,p_call_type); $$;
create or replace function public.spike_video_call_respond(p_call_id uuid, p_action text) returns text
language sql security invoker set search_path = '' as $$ select private.spike_video_call_respond(p_call_id,p_action); $$;
create or replace function public.spike_video_call_end(p_call_id uuid) returns text
language sql security invoker set search_path = '' as $$ select private.spike_video_call_end(p_call_id); $$;

revoke all on function private.spike_video_call_start(uuid,text), private.spike_video_call_respond(uuid,text), private.spike_video_call_end(uuid) from public, anon;
grant execute on function private.spike_video_call_start(uuid,text), private.spike_video_call_respond(uuid,text), private.spike_video_call_end(uuid) to authenticated;
revoke all on function public.spike_video_call_start(uuid,text), public.spike_video_call_respond(uuid,text), public.spike_video_call_end(uuid) from public, anon;
grant execute on function public.spike_video_call_start(uuid,text), public.spike_video_call_respond(uuid,text), public.spike_video_call_end(uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spike_video_calls') then alter publication supabase_realtime add table public.spike_video_calls; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spike_video_call_signals') then alter publication supabase_realtime add table public.spike_video_call_signals; end if;
end; $$;
