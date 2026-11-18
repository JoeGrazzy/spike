-- Correctly group the participant predicate before applying the active-state filter.
create or replace function private.spike_dm_calls_v2_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  first_user text;
  second_user text;
begin
  if actor is null or new.caller_id is distinct from actor then
    raise exception 'Only the signed-in caller may create a call';
  end if;
  if new.callee_id = actor then raise exception 'You cannot call yourself'; end if;
  if new.status <> 'ringing' or new.offer is null or new.offer->>'type' <> 'offer' then
    raise exception 'A new call must begin with a valid ringing offer';
  end if;
  if not public.can_message_spike_user(actor, new.callee_id) then
    raise exception 'This member is not available for a private call';
  end if;
  first_user := least(new.caller_id::text, new.callee_id::text);
  second_user := greatest(new.caller_id::text, new.callee_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(first_user, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(second_user, 0));
  if exists (
    select 1 from public.spike_dm_calls_v2 c
    where (c.caller_id in (new.caller_id, new.callee_id) or c.callee_id in (new.caller_id, new.callee_id))
      and (c.status = 'accepted' or (c.status = 'ringing' and c.expires_at > now()))
  ) then
    raise exception 'One of these members is already in a SPIKE call';
  end if;
  return new;
end;
$$;
revoke all on function private.spike_dm_calls_v2_guard_insert() from public, anon, authenticated;
