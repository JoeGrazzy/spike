-- Leveling V3 / SPIKE World reward hardening.
-- Serializes per-user/source/day reward issuance so the daily cap cannot be bypassed by concurrent requests.
-- Also includes mission_progress in the server-owned reward source allowlist.
create or replace function public.spike_season_award_points(p_user_id uuid, p_points integer, p_source text default 'activity')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  after_points int;
  today_points int;
  safe_points int;
  lock_key bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id<>uid then raise exception 'Only the signed-in user can earn points'; end if;
  if coalesce(p_points,0)<=0 then return jsonb_build_object('ok',false,'reason','no_points'); end if;
  if p_source not in('battle_created','battle_vote','chain_created','chain_entry','mission_created','mission_join','mission_progress','mission_complete','circle_created','circle_join','circle_message') then raise exception 'Invalid season reward source'; end if;

  lock_key := hashtextextended(uid::text || ':' || p_source || ':' || to_char(current_date,'YYYY-MM-DD'),0);
  perform pg_advisory_xact_lock(lock_key);

  select id into sid from public.spike_seasons where starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if sid is null then return jsonb_build_object('ok',false,'reason','no_live_season'); end if;

  select coalesce(sum(greatest(coalesce(points,0),0)),0) into today_points
  from public.spike_world_reward_events
  where user_id=uid and source=p_source and created_at>=date_trunc('day',now());

  safe_points:=least(greatest(p_points,0),greatest(0,100-today_points));
  if safe_points<=0 then return jsonb_build_object('ok',false,'reason','daily_source_cap'); end if;

  insert into public.spike_world_reward_events(user_id,source,points,created_at)
  values(uid,p_source,safe_points,now());

  insert into public.spike_season_points(season_id,user_id,points)
  values(sid,uid,safe_points)
  on conflict(season_id,user_id) do update set points=public.spike_season_points.points+excluded.points,updated_at=now()
  returning points into after_points;

  return jsonb_build_object('ok',true,'points',after_points,'awarded',safe_points,'season_id',sid,'source',p_source);
end
$$;
