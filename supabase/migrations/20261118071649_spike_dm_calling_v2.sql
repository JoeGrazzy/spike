-- SPIKE Direct Message Calling v2: isolated from the retired call schema and SPIKE Rooms.
-- Supabase stores call state and signaling payloads; WebRTC carries live media.

create table if not exists public.spike_dm_calls_v2 (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','cancelled','missed','ended','failed')),
  offer jsonb not null,
  answer jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 seconds'),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint spike_dm_calls_v2_distinct_users check (caller_id <> callee_id),
  constraint spike_dm_calls_v2_expiry_window check (expires_at > created_at and expires_at <= created_at + interval '2 minutes')
);

create index if not exists spike_dm_calls_v2_callee_recent_idx
  on public.spike_dm_calls_v2 (callee_id, created_at desc);
create index if not exists spike_dm_calls_v2_caller_recent_idx
  on public.spike_dm_calls_v2 (caller_id, created_at desc);
create index if not exists spike_dm_calls_v2_active_expiry_idx
  on public.spike_dm_calls_v2 (expires_at)
  where status = 'ringing';

create table if not exists public.spike_dm_call_ice_v2 (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.spike_dm_calls_v2(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  candidate jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists spike_dm_call_ice_v2_call_created_idx
  on public.spike_dm_call_ice_v2 (call_id, created_at);

alter table public.spike_dm_calls_v2 enable row level security;
alter table public.spike_dm_call_ice_v2 enable row level security;

-- New public-schema tables receive only the minimum authenticated grants.
grant select, insert, update on public.spike_dm_calls_v2 to authenticated;
grant select, insert on public.spike_dm_call_ice_v2 to authenticated;

drop policy if exists "spike dm calls v2 participants read" on public.spike_dm_calls_v2;
create policy "spike dm calls v2 participants read"
  on public.spike_dm_calls_v2 for select to authenticated
  using ((select auth.uid()) in (caller_id, callee_id));

drop policy if exists "spike dm calls v2 caller creates" on public.spike_dm_calls_v2;
create policy "spike dm calls v2 caller creates"
  on public.spike_dm_calls_v2 for insert to authenticated
  with check (
    caller_id = (select auth.uid())
    and callee_id <> (select auth.uid())
    and status = 'ringing'
    and offer is not null
    and expires_at > now()
    and expires_at <= now() + interval '2 minutes'
  );

drop policy if exists "spike dm calls v2 participants update" on public.spike_dm_calls_v2;
create policy "spike dm calls v2 participants update"
  on public.spike_dm_calls_v2 for update to authenticated
  using ((select auth.uid()) in (caller_id, callee_id))
  with check ((select auth.uid()) in (caller_id, callee_id));

drop policy if exists "spike dm ice participants read" on public.spike_dm_call_ice_v2;
create policy "spike dm ice participants read"
  on public.spike_dm_call_ice_v2 for select to authenticated
  using (exists (
    select 1 from public.spike_dm_calls_v2 c
    where c.id = call_id and (select auth.uid()) in (c.caller_id, c.callee_id)
  ));

drop policy if exists "spike dm ice participant sends own candidates" on public.spike_dm_call_ice_v2;
create policy "spike dm ice participant sends own candidates"
  on public.spike_dm_call_ice_v2 for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.spike_dm_calls_v2 c
      where c.id = call_id and (select auth.uid()) in (c.caller_id, c.callee_id)
        and c.status in ('ringing','accepted')
    )
  );

create or replace function public.spike_dm_calls_v2_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if new.id <> old.id
     or new.caller_id <> old.caller_id
     or new.callee_id <> old.callee_id
     or new.call_type <> old.call_type
     or new.offer is distinct from old.offer
     or new.created_at <> old.created_at
     or new.expires_at <> old.expires_at then
    raise exception 'Call identity and initial offer are immutable';
  end if;

  if old.status in ('rejected','cancelled','missed','ended','failed') then
    raise exception 'This call has already finished';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'ringing' and new.status = 'accepted' then
      if actor <> old.callee_id or new.answer is null then
        raise exception 'Only the invited recipient can accept with an answer';
      end if;
      new.answered_at := coalesce(new.answered_at, now());
    elsif old.status = 'ringing' and new.status = 'rejected' then
      if actor <> old.callee_id then raise exception 'Only the invited recipient can reject'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status = 'ringing' and new.status = 'cancelled' then
      if actor <> old.caller_id then raise exception 'Only the caller can cancel a ringing call'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status = 'ringing' and new.status = 'missed' then
      if actor <> old.callee_id or old.expires_at > now() then
        raise exception 'Only the recipient can mark an expired call missed';
      end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status in ('ringing','accepted') and new.status = 'failed' then
      if actor not in (old.caller_id, old.callee_id) then raise exception 'Not a call participant'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status = 'accepted' and new.status = 'ended' then
      if actor not in (old.caller_id, old.callee_id) then raise exception 'Not a call participant'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    else
      raise exception 'Invalid call state transition: % -> %', old.status, new.status;
    end if;
  elsif new.answer is distinct from old.answer then
    if actor <> old.callee_id or old.status <> 'ringing' or old.answer is not null or new.answer is null then
      raise exception 'Only the invited recipient may set the call answer';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.spike_dm_calls_v2_guard_update() from public, anon, authenticated;
drop trigger if exists spike_dm_calls_v2_guard_update on public.spike_dm_calls_v2;
create trigger spike_dm_calls_v2_guard_update
before update on public.spike_dm_calls_v2
for each row execute function public.spike_dm_calls_v2_guard_update();

-- Enable row-change delivery without touching Realtime's protected schema.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'spike_dm_calls_v2'
  ) then
    alter publication supabase_realtime add table public.spike_dm_calls_v2;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'spike_dm_call_ice_v2'
  ) then
    alter publication supabase_realtime add table public.spike_dm_call_ice_v2;
  end if;
end $$;
