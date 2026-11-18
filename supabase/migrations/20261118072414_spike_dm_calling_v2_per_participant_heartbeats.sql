-- Track each participant separately so one open tab cannot keep a closed peer marked busy.
drop index if exists public.spike_dm_calls_v2_accepted_heartbeat_idx;
alter table public.spike_dm_calls_v2 drop column if exists heartbeat_at;
alter table public.spike_dm_calls_v2
  add column caller_heartbeat_at timestamptz not null default now(),
  add column callee_heartbeat_at timestamptz not null default now();
create index if not exists spike_dm_calls_v2_accepted_heartbeat_idx
  on public.spike_dm_calls_v2 (caller_heartbeat_at, callee_heartbeat_at)
  where status = 'accepted';

create or replace function public.spike_dm_calls_v2_guard_update()
returns trigger language plpgsql set search_path = ''
as $$
declare actor uuid := auth.uid(); first_user text; second_user text;
begin
  if new.id <> old.id or new.caller_id <> old.caller_id or new.callee_id <> old.callee_id
     or new.call_type <> old.call_type or new.offer is distinct from old.offer
     or new.created_at <> old.created_at or new.expires_at <> old.expires_at then
    raise exception 'Call identity and initial offer are immutable';
  end if;
  if old.status in ('rejected','cancelled','missed','ended','failed') then raise exception 'This call has already finished'; end if;
  if new.caller_heartbeat_at is distinct from old.caller_heartbeat_at then
    if old.status <> 'accepted' or actor <> old.caller_id then raise exception 'Only the active caller may update the caller heartbeat'; end if;
    first_user := least(old.caller_id::text, old.callee_id::text);
    second_user := greatest(old.caller_id::text, old.callee_id::text);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(first_user, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(second_user, 0));
    new.caller_heartbeat_at := now();
  end if;
  if new.callee_heartbeat_at is distinct from old.callee_heartbeat_at then
    if old.status <> 'accepted' or actor <> old.callee_id then raise exception 'Only the active callee may update the callee heartbeat'; end if;
    first_user := least(old.caller_id::text, old.callee_id::text);
    second_user := greatest(old.caller_id::text, old.callee_id::text);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(first_user, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(second_user, 0));
    new.callee_heartbeat_at := now();
  end if;
  if new.status is distinct from old.status then
    if old.status = 'ringing' and new.status = 'accepted' then
      if actor <> old.callee_id or new.answer is null or new.answer->>'type' <> 'answer' or nullif(new.answer->>'sdp','') is null then
        raise exception 'Only the invited recipient can accept with a valid answer';
      end if;
      new.answered_at := coalesce(new.answered_at, now());
      new.caller_heartbeat_at := now(); new.callee_heartbeat_at := now();
    elsif old.status = 'ringing' and new.status = 'rejected' then
      if actor <> old.callee_id then raise exception 'Only the invited recipient can reject'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status = 'ringing' and new.status = 'cancelled' then
      if actor <> old.caller_id then raise exception 'Only the caller can cancel a ringing call'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status = 'ringing' and new.status = 'missed' then
      if actor <> old.callee_id or old.expires_at > now() then raise exception 'Only the recipient can mark an expired call missed'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status in ('ringing','accepted') and new.status = 'failed' then
      if actor not in (old.caller_id, old.callee_id) then raise exception 'Not a call participant'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    elsif old.status = 'accepted' and new.status = 'ended' then
      if actor not in (old.caller_id, old.callee_id) then raise exception 'Not a call participant'; end if;
      new.ended_at := coalesce(new.ended_at, now());
    else raise exception 'Invalid call state transition: % -> %', old.status, new.status;
    end if;
  elsif new.answer is distinct from old.answer then
    if actor <> old.callee_id or old.status <> 'ringing' or old.answer is not null or new.answer is null
       or new.answer->>'type' <> 'answer' or nullif(new.answer->>'sdp','') is null then
      raise exception 'Only the invited recipient may set a valid call answer';
    end if;
  end if;
  new.updated_at := now(); return new;
end;
$$;
revoke all on function public.spike_dm_calls_v2_guard_update() from public, anon, authenticated;
drop trigger if exists spike_dm_calls_v2_guard_update on public.spike_dm_calls_v2;
create trigger spike_dm_calls_v2_guard_update before update on public.spike_dm_calls_v2
for each row execute function public.spike_dm_calls_v2_guard_update();

create or replace function private.spike_dm_calls_v2_guard_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); first_user text; second_user text;
begin
  if actor is null or new.caller_id is distinct from actor then raise exception 'Only the signed-in caller may create a call'; end if;
  if new.callee_id = actor then raise exception 'You cannot call yourself'; end if;
  if new.status <> 'ringing' or new.offer is null or new.offer->>'type' <> 'offer' or nullif(new.offer->>'sdp','') is null then
    raise exception 'A new call must begin with a valid ringing offer';
  end if;
  if not public.can_message_spike_user(actor, new.callee_id) then raise exception 'This member is not available for a private call'; end if;
  first_user := least(new.caller_id::text, new.callee_id::text);
  second_user := greatest(new.caller_id::text, new.callee_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(first_user, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(second_user, 0));
  if exists (
    select 1 from public.spike_dm_calls_v2 c
    where (c.caller_id in (new.caller_id, new.callee_id) or c.callee_id in (new.caller_id, new.callee_id))
      and ((c.status = 'ringing' and c.expires_at > now())
        or (c.status = 'accepted' and c.caller_heartbeat_at > now() - interval '90 seconds'
          and c.callee_heartbeat_at > now() - interval '90 seconds'))
  ) then raise exception 'One of these members is already in a SPIKE call'; end if;
  return new;
end;
$$;
revoke all on function private.spike_dm_calls_v2_guard_insert() from public, anon, authenticated;
