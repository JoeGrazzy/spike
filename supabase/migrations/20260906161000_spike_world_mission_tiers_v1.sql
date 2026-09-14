-- SPIKE World: fixed Community Mission XP tiers and server-defined difficulty.
-- XP is never an arbitrary client-supplied reward.

alter table public.spike_community_missions
  drop constraint if exists spike_community_missions_xp_reward_check;

-- Normalize existing missions before the new constraint is added.
update public.spike_community_missions
set xp_reward = case
  when target <= 10 then 50
  when target <= 25 then 100
  when target <= 50 then 250
  when target <= 100 then 500
  else 1000
end
where xp_reward not in (50,100,250,500,1000);

alter table public.spike_community_missions
  add constraint spike_community_missions_xp_reward_tier_check
  check (xp_reward in (50,100,250,500,1000));

create or replace function public.spike_mission_create(
  p_title text,
  p_description text default '',
  p_target integer default null,
  p_xp_reward integer default 100,
  p_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  mid uuid;
  tier int := coalesce(p_xp_reward,100);
  target_value int;
  days_value int;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if tier not in (50,100,250,500,1000) then
    raise exception 'Choose a valid Mission difficulty tier';
  end if;

  -- The reward tier defines the difficulty. Client target/days are deliberately ignored.
  target_value := case tier
    when 50 then 10
    when 100 then 25
    when 250 then 50
    when 500 then 100
    when 1000 then 250
  end;
  days_value := case tier
    when 50 then 3
    when 100 then 5
    when 250 then 7
    when 500 then 10
    when 1000 then 14
  end;

  if nullif(trim(coalesce(p_title,'')),'') is null then
    raise exception 'Mission title is required';
  end if;

  insert into public.spike_community_missions
    (creator_id,title,description,target,xp_reward,ends_at)
  values
    (uid,trim(p_title),coalesce(trim(p_description),''),target_value,tier,now()+make_interval(days=>days_value))
  returning id into mid;

  insert into public.spike_community_mission_members(mission_id,user_id)
  values(mid,uid);

  perform public.spike_season_award_points(uid,10,'mission_created');
  return jsonb_build_object(
    'ok',true,
    'mission_id',mid,
    'xp_reward',tier,
    'target',target_value,
    'days',days_value
  );
end $$;

-- Tighten progress: only one small contribution at a time and a short cooldown.
create table if not exists public.spike_community_mission_progress_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.spike_community_missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  increment integer not null check (increment between 1 and 1),
  created_at timestamptz not null default now()
);

create index if not exists spike_mission_progress_events_user_idx
  on public.spike_community_mission_progress_events(mission_id,user_id,created_at desc);

alter table public.spike_community_mission_progress_events enable row level security;

create or replace function public.spike_mission_progress(
  p_mission_id uuid,
  p_increment integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  target int;
  xp int;
  oldp int;
  newp int;
  completed boolean := false;
  recent boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(p_increment,1) <> 1 then raise exception 'Mission progress must be recorded one contribution at a time'; end if;

  select m.target,m.xp_reward
    into target,xp
  from public.spike_community_missions m
  join public.spike_community_mission_members mm
    on mm.mission_id=m.id and mm.user_id=uid
  where m.id=p_mission_id and m.active and m.ends_at>now();

  if target is null then raise exception 'Join an active mission first'; end if;

  select exists(
    select 1 from public.spike_community_mission_progress_events e
    where e.mission_id=p_mission_id and e.user_id=uid
      and e.created_at > now() - interval '30 seconds'
  ) into recent;
  if recent then raise exception 'Please wait before recording more progress'; end if;

  select progress into oldp
  from public.spike_community_mission_members
  where mission_id=p_mission_id and user_id=uid
  for update;

  newp:=least(target,oldp+1);
  completed:=newp>=target and oldp<target;

  insert into public.spike_community_mission_progress_events(mission_id,user_id,increment)
  values(p_mission_id,uid,1);

  update public.spike_community_mission_members
  set progress=newp,
      completed_at=case when completed then now() else completed_at end
  where mission_id=p_mission_id and user_id=uid;

  perform public.spike_season_award_points(uid,1,'mission_progress');

  if completed then
    perform public.spike_gamification_award(uid,xp,'community_mission',p_mission_id::text,'{}'::jsonb);
    perform public.spike_season_award_points(uid,25,'mission_complete');
  end if;

  return jsonb_build_object(
    'ok',true,
    'progress',newp,
    'target',target,
    'completed',completed,
    'xp_awarded',case when completed then xp else 0 end
  );
end $$;

revoke all on table public.spike_community_mission_progress_events from anon,authenticated;

revoke execute on function public.spike_mission_create(text,text,integer,integer,integer) from public,anon;
grant execute on function public.spike_mission_create(text,text,integer,integer,integer) to authenticated;
revoke execute on function public.spike_mission_progress(uuid,integer) from public,anon;
grant execute on function public.spike_mission_progress(uuid,integer) to authenticated;
