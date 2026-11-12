-- Remove the remaining XP/level mechanics used by Room Accounts and daily tasks.
-- Creator qualification keeps its non-level criteria and the optional privileged unlock.
CREATE OR REPLACE FUNCTION public.room_account_progress()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT jsonb_build_object('handle',a.handle,'display_name',a.display_name,'bio',a.bio,'icon',a.icon)
    FROM public.room_accounts a WHERE a.user_id=auth.uid()), '{}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.room_creator_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); acct public.room_accounts; prof public.profiles;
  joined_count integer := 0; message_count integer := 0; active_room_count integer := 0;
  friend_count integer := 0; profile_done integer := 0; challenge_done boolean := false;
  good_standing boolean := true; dev_unlocked boolean := false; account_age_done boolean := false;
  account_created_at timestamptz; requirements jsonb; completed_count integer := 0;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('can_create',false,'eligible',false,'completed_count',0,'total_requirements',9); END IF;
  SELECT * INTO acct FROM public.room_accounts WHERE user_id=uid LIMIT 1;
  SELECT * INTO prof FROM public.profiles WHERE id=uid LIMIT 1;
  SELECT created_at INTO account_created_at FROM auth.users WHERE id=uid;
  SELECT count(*) INTO joined_count FROM public.room_members WHERE user_id=uid;
  SELECT count(*) INTO message_count FROM public.room_messages WHERE user_id=uid;
  SELECT count(DISTINCT room_id) INTO active_room_count FROM public.room_messages WHERE user_id=uid;
  SELECT count(*) INTO friend_count FROM public.friendships WHERE user_id=uid OR friend_id=uid;
  profile_done := (CASE WHEN nullif(trim(coalesce(prof.username,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
    +(CASE WHEN nullif(trim(coalesce(prof.display_name,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
    +(CASE WHEN nullif(trim(coalesce(prof.avatar_url,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
    +(CASE WHEN nullif(trim(coalesce(prof.bio,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
    +(CASE WHEN nullif(trim(coalesce(prof.website,'')),'') IS NOT NULL THEN 1 ELSE 0 END);
  SELECT EXISTS(SELECT 1 FROM public.room_creator_challenges c WHERE c.user_id=uid AND c.completed_at IS NOT NULL) INTO challenge_done;
  SELECT NOT EXISTS(SELECT 1 FROM public.room_moderation_actions WHERE target_user_id=uid AND action IN ('ban','suspend','mute','kick') AND created_at>=now()-interval '30 days') INTO good_standing;
  SELECT EXISTS(SELECT 1 FROM public.room_creator_access WHERE user_id=uid AND status='unlocked') INTO dev_unlocked;
  account_age_done := account_created_at IS NOT NULL AND account_created_at <= now()-interval '18 months';
  requirements := jsonb_build_array(
    jsonb_build_object('key','profile','label','Complete profile 100%','current',profile_done,'target',5,'done',profile_done>=5),
    jsonb_build_object('key','room_account','label','Complete Room Account','current',CASE WHEN acct.user_id IS NOT NULL THEN 1 ELSE 0 END,'target',1,'done',acct.user_id IS NOT NULL),
    jsonb_build_object('key','rooms','label','Join 5 rooms','current',joined_count,'target',5,'done',joined_count>=5),
    jsonb_build_object('key','messages','label','Make 50 meaningful contributions','current',message_count,'target',50,'done',message_count>=50),
    jsonb_build_object('key','communities','label','Participate in 3 different rooms','current',active_room_count,'target',3,'done',active_room_count>=3),
    jsonb_build_object('key','connections','label','Make 5+ SPIKE connections','current',friend_count,'target',5,'done',friend_count>=5),
    jsonb_build_object('key','challenge','label','Complete Creator Qualification Challenge','current',CASE WHEN challenge_done THEN 1 ELSE 0 END,'target',1,'done',challenge_done),
    jsonb_build_object('key','standing','label','Maintain good community standing','current',CASE WHEN good_standing THEN 1 ELSE 0 END,'target',1,'done',good_standing),
    jsonb_build_object('key','account_age','label','Maintain a 1 year 6 month old SPIKE account','current',CASE WHEN account_age_done THEN 18 ELSE greatest(0,coalesce(extract(month from age(now(),account_created_at))::integer,0)) END,'target',18,'done',account_age_done));
  SELECT count(*) INTO completed_count FROM jsonb_array_elements(requirements) x WHERE coalesce((x->>'done')::boolean,false);
  RETURN jsonb_build_object('has_room_account',acct.user_id IS NOT NULL,'eligible',completed_count=9,
    'can_create',dev_unlocked OR completed_count=9,'dev_unlocked',dev_unlocked,'completed_count',completed_count,
    'total_requirements',9,'requirements',requirements,'challenge_completed',challenge_done,
    'good_standing',good_standing,'account_age_completed',account_age_done,'account_created_at',account_created_at);
END;
$function$;

DROP FUNCTION IF EXISTS public.room_creator_progress();
DROP FUNCTION IF EXISTS public.spike_get_daily_tasks();
DROP TABLE IF EXISTS public.spike_task_completions CASCADE;
ALTER TABLE public.room_accounts DROP COLUMN IF EXISTS xp;
ALTER TABLE public.room_accounts DROP COLUMN IF EXISTS level;
ALTER TABLE public.room_chat_styles DROP COLUMN IF EXISTS min_level;
ALTER TABLE public.room_targets DROP COLUMN IF EXISTS xp_reward;
