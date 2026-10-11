-- SPIKE Leveling V3: harder long-term progression with legacy-level protection.
-- Existing XP is never removed and an existing member level never decreases solely
-- because the progression curve became harder. Future levels use the new thresholds.

begin;

with anchors(level, xp_required) as (
  values
    (1,0),(10,6000),(20,18000),(30,40000),(40,70000),(50,105000),
    (60,145000),(70,185000),(80,225000),(90,265000),(100,310000)
),
levels as (
  select gs.level,
         round(
           a.xp_required::numeric +
           (b.xp_required-a.xp_required)::numeric *
           (gs.level-a.level)::numeric / nullif((b.level-a.level)::numeric,0)
         )::integer as xp_required
  from anchors a
  join anchors b on b.level = a.level + 10
  cross join lateral generate_series(a.level,b.level) as gs(level)
)
update public.level_definitions set xp_required = -1000000 - level;

update public.level_definitions d
set xp_required = l.xp_required
from levels l
where d.level = l.level;

-- Keep the first nine thresholds explicit as a deterministic guard against any
-- planner/CTE edge case around the first interpolation segment.
update public.level_definitions as d
set xp_required=v.xp
from (values (1,0),(2,667),(3,1333),(4,2000),(5,2667),(6,3333),(7,4000),(8,4667),(9,5333)) as v(level,xp)
where d.level=v.level;

-- A member who has already reached a level keeps it. New awards may advance a
-- member, but can never cause a level regression.
create or replace function public.spike_gamification_award(
  p_uid uuid,
  p_amount integer,
  p_source text,
  p_source_id text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_xp integer;
  v_level integer;
  v_rank text;
  v_current_level integer;
  v_derived_level integer;
begin
  if p_uid is null or p_amount <= 0 then return; end if;

  insert into public.xp_transactions(user_id,amount,source,source_id,metadata)
  values(p_uid,p_amount,p_source,p_source_id,coalesce(p_metadata,'{}'::jsonb));

  update public.profiles
  set xp=greatest(0,coalesce(xp,0)+p_amount),updated_at=now()
  where id=p_uid
  returning xp,coalesce(level,1) into v_xp,v_current_level;

  select level,rank into v_derived_level,v_rank
  from public.level_definitions
  where xp_required<=v_xp
  order by level desc limit 1;

  v_level:=greatest(coalesce(v_current_level,1),coalesce(v_derived_level,1));

  select rank into v_rank
  from public.level_definitions
  where level=v_level;

  update public.profiles
  set level=v_level,rank=coalesce(v_rank,'Newcomer'),updated_at=now()
  where id=p_uid;
end
$$;

create or replace function public.spike_daily_check_in() returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_s public.user_streaks%rowtype;
  v_new integer;
  v_reward integer;
  v_base integer;
  v_mult numeric;
  v_xp integer;
  v_level integer;
  v_rank text;
  v_derived_level integer;
  v_last date;
  v_source text;
  v_already boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_s from public.user_streaks where user_id=v_uid;
  v_last:=coalesce(v_s.last_activity,current_date-2);

  if v_last=current_date then
    v_already:=true;
    v_new:=coalesce(v_s.current_streak,0);
  else
    v_new:=case when v_last=current_date-1 then coalesce(v_s.current_streak,0)+1 else 1 end;
    v_base:=10;
    v_mult:=public.spike_streak_multiplier(v_new);
    v_reward:=round(v_base*v_mult)::integer;
    if v_new in (3,7,14,30,60,100,180,365) then
      v_reward:=v_reward+(case v_new
        when 3 then 15 when 7 then 50 when 14 then 100 when 30 then 250
        when 60 then 500 when 100 then 1000 when 180 then 2000 when 365 then 5000
        else 0 end);
    end if;

    insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity,revenue_days)
    values(v_uid,v_new,greatest(coalesce(v_s.longest_streak,0),v_new),now(),coalesce(v_s.revenue_days,0))
    on conflict(user_id) do update set
      current_streak=excluded.current_streak,
      longest_streak=excluded.longest_streak,
      last_activity=excluded.last_activity;

    update public.profiles
    set current_streak=v_new,
        longest_streak=greatest(longest_streak,v_new),
        last_activity_at=now(),updated_at=now()
    where id=v_uid;

    v_source:='streak_checkin:'||current_date::text;
    insert into public.xp_transactions(user_id,amount,source,source_id,metadata)
    values(v_uid,v_reward,'streak',v_source,jsonb_build_object(
      'base_xp',v_base,'streak',v_new,'multiplier',v_mult,
      'milestone_reward',greatest(0,v_reward-round(v_base*v_mult)::integer)
    ));

    update public.profiles
    set xp=greatest(0,xp+v_reward),updated_at=now()
    where id=v_uid
    returning xp,coalesce(level,1) into v_xp,v_level;

    select level,rank into v_derived_level,v_rank
    from public.level_definitions
    where xp_required<=v_xp
    order by level desc limit 1;

    v_level:=greatest(coalesce(v_level,1),coalesce(v_derived_level,1));
    select rank into v_rank from public.level_definitions where level=v_level;

    update public.profiles
    set level=v_level,rank=coalesce(v_rank,'Newcomer'),updated_at=now()
    where id=v_uid;

    return jsonb_build_object(
      'ok',true,'already_checked_in',false,'streak',v_new,
      'xp_awarded',v_reward,'xp',v_xp,'level',v_level,
      'rank',coalesce(v_rank,'Newcomer')
    );
  end if;

  select xp,level,rank into v_xp,v_level,v_rank
  from public.profiles where id=v_uid;
  return jsonb_build_object(
    'ok',true,'already_checked_in',true,'streak',v_new,
    'xp_awarded',0,'xp',v_xp,'level',v_level,'rank',v_rank
  );
end
$$;

commit;
