-- Serialize mission joins against the mission row so max_participants cannot be exceeded by concurrent joins.
create or replace function public.spike_mission_join(p_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  uid uuid := auth.uid();
  cap int;
  n int;
  already boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select max_participants into cap
  from public.spike_community_missions
  where id=p_mission_id and active and ends_at>now()
  for update;

  if cap is null then raise exception 'Mission not available'; end if;

  already:=exists(select 1 from public.spike_community_mission_members where mission_id=p_mission_id and user_id=uid);
  select count(*) into n from public.spike_community_mission_members where mission_id=p_mission_id;
  if n>=cap and not already then raise exception 'Mission is full'; end if;

  insert into public.spike_community_mission_members(mission_id,user_id)
  values(p_mission_id,uid) on conflict do nothing;

  if not already then perform public.spike_season_award_points(uid,5,'mission_join'); end if;
  return jsonb_build_object('ok',true);
end
$$;
