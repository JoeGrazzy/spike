-- Phase 4: combine the two per-session heartbeat writes into one authenticated
-- RPC round trip. The private helper retains the existing visibility and
-- account-status checks; auth.uid() remains the only identity source.
create or replace function public.spike_touch_activity()
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $fn$
declare
  v_uid uuid := auth.uid();
  v_seen timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  insert into private.spike_user_activity(user_id,last_seen_at)
  values(v_uid,v_seen)
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at;

  perform private.spike_touch_presence_for_caller();
  return v_seen;
end
$fn$;

-- CREATE OR REPLACE preserves the existing function owner and ACL. Reassert
-- the intended authenticated-only execute contract explicitly.
revoke all on function public.spike_touch_activity() from public, anon;
grant execute on function public.spike_touch_activity() to authenticated;
