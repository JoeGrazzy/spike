-- Serialize the daily check-in per user so concurrent requests cannot award
-- the same day's XP twice. The row is created first, then locked for the full
-- read/update/reward transaction.
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
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  insert into public.user_streaks(user_id)
  values(v_uid)
  on conflict(user_id) do nothing;

  select * into v_s
  from public.user_streaks
  where user_id=v_uid
  for update;

  v_last:=coalesce(v_s.last_activity,current_date-2);

  if v_last=current_date then
    select xp,level,rank into v_xp,v_level,v_rank from public.profiles where id=v_uid;
    return jsonb_build_object('ok',true,'already_checked_in',true,'streak',coalesce(v_s.current_streak,0),'xp_awarded',0,'xp',v_xp,'level',v_level,'rank',v_rank);
  end if;

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

  update public.user_streaks
  set current_streak=v_new,
      longest_streak=greatest(coalesce(longest_streak,0),v_new),
      last_activity=now()
  where user_id=v_uid;

  update public.profiles
  set current_streak=v_new,
      longest_streak=greatest(coalesce(longest_streak,0),v_new),
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
end
$$;
