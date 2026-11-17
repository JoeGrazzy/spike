BEGIN;

-- SPIKE Referral System v1
-- Referral points are a separate, non-cash points ledger. They do not touch
-- wallets, SP Coins, creator earnings, or the paid SPIKE Verified badge.

CREATE TABLE IF NOT EXISTS private.spike_referral_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT true,
  leaderboard_enabled boolean NOT NULL DEFAULT true,
  inviter_points integer NOT NULL DEFAULT 25 CHECK (inviter_points BETWEEN 0 AND 100000),
  invitee_points integer NOT NULL DEFAULT 10 CHECK (invitee_points BETWEEN 0 AND 100000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.spike_referral_settings(singleton)
VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.spike_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^SPK-[A-Z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spike_referral_codes_code_idx
  ON private.spike_referral_codes(code);

CREATE TABLE IF NOT EXISTS private.spike_referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  rejection_reason text,
  CONSTRAINT spike_referral_no_self_referral CHECK (inviter_id <> invitee_id)
);
CREATE INDEX IF NOT EXISTS spike_referral_attributions_inviter_idx
  ON private.spike_referral_attributions(inviter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spike_referral_attributions_status_idx
  ON private.spike_referral_attributions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS private.spike_referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id uuid NOT NULL REFERENCES private.spike_referral_attributions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('signup_attributed','qualified','rewards_issued','rejected')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spike_referral_events_attribution_idx
  ON private.spike_referral_events(attribution_id, created_at DESC);

CREATE TABLE IF NOT EXISTS private.spike_referral_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attribution_id uuid NOT NULL REFERENCES private.spike_referral_attributions(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('referrer_reward','invitee_welcome_reward','admin_adjustment','admin_reversal')),
  amount integer NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT spike_referral_point_ledger_once UNIQUE(user_id, attribution_id, entry_type)
);
CREATE INDEX IF NOT EXISTS spike_referral_point_ledger_user_idx
  ON private.spike_referral_point_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spike_referral_point_ledger_attribution_idx
  ON private.spike_referral_point_ledger(attribution_id);
CREATE INDEX IF NOT EXISTS spike_referral_point_ledger_created_by_idx
  ON private.spike_referral_point_ledger(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS spike_referral_settings_updated_by_idx
  ON private.spike_referral_settings(updated_by) WHERE updated_by IS NOT NULL;

ALTER TABLE private.spike_referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.spike_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.spike_referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.spike_referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.spike_referral_point_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.spike_referral_settings, private.spike_referral_codes,
  private.spike_referral_attributions, private.spike_referral_events,
  private.spike_referral_point_ledger FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.spike_referral_capture_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code text;
  v_inviter uuid;
  v_attribution uuid;
BEGIN
  v_code := upper(trim(coalesce(NEW.raw_user_meta_data->>'referral_code','')));
  IF v_code !~ '^SPK-[A-Z0-9]{8}$' THEN RETURN NEW; END IF;
  SELECT c.user_id INTO v_inviter
  FROM private.spike_referral_codes c
  WHERE c.code = v_code;
  IF v_inviter IS NULL OR v_inviter = NEW.id THEN RETURN NEW; END IF;

  INSERT INTO private.spike_referral_attributions(inviter_id,invitee_id,referral_code)
  VALUES(v_inviter,NEW.id,v_code)
  ON CONFLICT(invitee_id) DO NOTHING
  RETURNING id INTO v_attribution;
  IF v_attribution IS NOT NULL THEN
    INSERT INTO private.spike_referral_events(attribution_id,event_type,details)
    VALUES(v_attribution,'signup_attributed',jsonb_build_object('referral_code',v_code));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'SPIKE referral signup capture failed for auth user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.spike_referral_capture_pending(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_code text:=upper(trim(coalesce(p_code,'')));
  v_inviter uuid;
  v_created timestamptz;
  v_attr uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF v_code !~ '^SPK-[A-Z0-9]{8}$' THEN RETURN jsonb_build_object('captured',false,'reason','invalid_code'); END IF;
  SELECT created_at INTO v_created FROM auth.users WHERE id=v_uid;
  IF v_created IS NULL OR v_created < now()-interval '30 minutes' THEN
    RETURN jsonb_build_object('captured',false,'reason','signup_window_expired');
  END IF;
  IF EXISTS(SELECT 1 FROM private.spike_referral_attributions WHERE invitee_id=v_uid) THEN
    RETURN jsonb_build_object('captured',false,'reason','attribution_already_set');
  END IF;
  SELECT user_id INTO v_inviter FROM private.spike_referral_codes WHERE code=v_code;
  IF v_inviter IS NULL OR v_inviter=v_uid THEN
    RETURN jsonb_build_object('captured',false,'reason','invalid_or_self_referral');
  END IF;
  INSERT INTO private.spike_referral_attributions(inviter_id,invitee_id,referral_code)
  VALUES(v_inviter,v_uid,v_code) ON CONFLICT(invitee_id) DO NOTHING RETURNING id INTO v_attr;
  IF v_attr IS NULL THEN RETURN jsonb_build_object('captured',false,'reason','attribution_already_set'); END IF;
  INSERT INTO private.spike_referral_events(attribution_id,event_type,details)
  VALUES(v_attr,'signup_attributed',jsonb_build_object('referral_code',v_code,'capture_source','oauth_callback'));
  PERFORM private.spike_referral_process_for_user(v_uid);
  RETURN jsonb_build_object('captured',true,'attribution_id',v_attr);
END;
$$;

CREATE OR REPLACE FUNCTION private.spike_referral_process_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attr private.spike_referral_attributions;
  v_auth auth.users;
  v_profile public.profiles;
  v_settings private.spike_referral_settings;
  v_awarded integer := 0;
  v_added integer := 0;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_attr
  FROM private.spike_referral_attributions
  WHERE invitee_id = p_user_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_auth FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF v_auth.email_confirmed_at IS NULL AND v_auth.phone_confirmed_at IS NULL THEN RETURN; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND
     OR nullif(trim(coalesce(v_profile.username,'')),'') IS NULL
     OR nullif(trim(coalesce(v_profile.display_name,'')),'') IS NULL THEN
    RETURN;
  END IF;
  IF v_profile.restricted_until IS NOT NULL AND v_profile.restricted_until > now() THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM auth.users u
    LEFT JOIN public.profiles p ON p.id=u.id
    WHERE u.id=v_attr.inviter_id
      AND (u.deleted_at IS NOT NULL OR (p.restricted_until IS NOT NULL AND p.restricted_until>now()))
  ) THEN RETURN; END IF;

  SELECT * INTO v_settings FROM private.spike_referral_settings WHERE singleton = true;
  IF NOT FOUND OR NOT v_settings.enabled THEN RETURN; END IF;

  UPDATE private.spike_referral_attributions
  SET status='qualified', qualified_at=now()
  WHERE id=v_attr.id AND status='pending';
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO private.spike_referral_events(attribution_id,event_type,details)
  VALUES(v_attr.id,'qualified',jsonb_build_object('verification','email_or_phone','profile_complete',true));

  IF v_settings.inviter_points > 0 THEN
    INSERT INTO private.spike_referral_point_ledger(user_id,attribution_id,entry_type,amount,reason)
    VALUES(v_attr.inviter_id,v_attr.id,'referrer_reward',v_settings.inviter_points,'Successful verified referral')
    ON CONFLICT(user_id,attribution_id,entry_type) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_awarded := v_awarded + CASE WHEN v_added > 0 THEN v_settings.inviter_points ELSE 0 END;
  END IF;

  IF v_settings.invitee_points > 0 THEN
    INSERT INTO private.spike_referral_point_ledger(user_id,attribution_id,entry_type,amount,reason)
    VALUES(p_user_id,v_attr.id,'invitee_welcome_reward',v_settings.invitee_points,'Welcome reward for joining through a referral')
    ON CONFLICT(user_id,attribution_id,entry_type) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_awarded := v_awarded + CASE WHEN v_added > 0 THEN v_settings.invitee_points ELSE 0 END;
  END IF;

  UPDATE private.spike_referral_attributions SET points_awarded=v_awarded WHERE id=v_attr.id;
  INSERT INTO private.spike_referral_events(attribution_id,event_type,details)
  VALUES(v_attr.id,'rewards_issued',jsonb_build_object('total_points',v_awarded,
    'inviter_points',v_settings.inviter_points,'invitee_points',v_settings.invitee_points));

  IF v_settings.inviter_points > 0 THEN
    INSERT INTO public.notifications(user_id,type,data,priority)
    VALUES(v_attr.inviter_id,'referral_success',jsonb_build_object(
      'message','Your referral has been verified. You earned SP Points.',
      'invitee_id',p_user_id,'points',v_settings.inviter_points),'normal');
  END IF;
  IF v_settings.invitee_points > 0 THEN
    INSERT INTO public.notifications(user_id,type,data,priority)
    VALUES(p_user_id,'referral_welcome_reward',jsonb_build_object(
      'message','Your account is verified. Your referral welcome points have been added.',
      'inviter_id',v_attr.inviter_id,'points',v_settings.invitee_points),'normal');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.spike_referral_profile_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.spike_referral_process_for_user(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'SPIKE referral profile processing failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.spike_referral_auth_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.spike_referral_process_for_user(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'SPIKE referral auth verification processing failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spike_referral_capture_signup ON auth.users;
CREATE TRIGGER spike_referral_capture_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.spike_referral_capture_signup();

DROP TRIGGER IF EXISTS spike_referral_auth_verified ON auth.users;
CREATE TRIGGER spike_referral_auth_verified
AFTER UPDATE OF email_confirmed_at, phone_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.spike_referral_auth_verified();

DROP TRIGGER IF EXISTS spike_referral_profile_changed ON public.profiles;
CREATE TRIGGER spike_referral_profile_changed
AFTER INSERT OR UPDATE OF username, display_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.spike_referral_profile_changed();

CREATE OR REPLACE FUNCTION public.spike_referral_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_earned bigint;
  v_total bigint;
  v_qualified bigint;
  v_pending bigint;
  v_points bigint;
  v_recent jsonb;
  v_history jsonb;
  v_settings private.spike_referral_settings;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT code INTO v_code FROM private.spike_referral_codes WHERE user_id=v_uid;
  IF v_code IS NULL THEN
    LOOP
      v_code := 'SPK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      INSERT INTO private.spike_referral_codes(user_id,code) VALUES(v_uid,v_code)
      ON CONFLICT DO NOTHING;
      EXIT WHEN FOUND;
      SELECT code INTO v_code FROM private.spike_referral_codes WHERE user_id=v_uid;
      EXIT WHEN v_code IS NOT NULL;
    END LOOP;
  END IF;
  SELECT * INTO v_settings FROM private.spike_referral_settings WHERE singleton=true;
  PERFORM private.spike_referral_process_for_user(v_uid);
  PERFORM private.spike_referral_process_for_user(a.invitee_id)
  FROM private.spike_referral_attributions a
  WHERE a.inviter_id=v_uid AND a.status='pending';

  SELECT count(*),count(*) FILTER(WHERE status='qualified'),count(*) FILTER(WHERE status='pending')
  INTO v_total,v_qualified,v_pending
  FROM private.spike_referral_attributions WHERE inviter_id=v_uid;
  SELECT coalesce(sum(amount),0),coalesce(sum(amount) FILTER(WHERE amount>0),0)
  INTO v_points,v_earned
  FROM private.spike_referral_point_ledger WHERE user_id=v_uid;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_recent FROM (
    SELECT jsonb_build_object('id',a.id,'status',a.status,'created_at',a.created_at,
      'qualified_at',a.qualified_at,'points_awarded',a.points_awarded,
      'invitee_name',coalesce(p.display_name,p.username,'SPIKE member'),
      'invitee_username',p.username) AS x
    FROM private.spike_referral_attributions a
    LEFT JOIN public.profiles p ON p.id=a.invitee_id
    WHERE a.inviter_id=v_uid ORDER BY a.created_at DESC LIMIT 20
  ) q;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_history FROM (
    SELECT jsonb_build_object('id',l.id,'entry_type',l.entry_type,'amount',l.amount,
      'reason',l.reason,'created_at',l.created_at) AS x
    FROM private.spike_referral_point_ledger l
    WHERE l.user_id=v_uid ORDER BY l.created_at DESC LIMIT 30
  ) q;
  RETURN jsonb_build_object('referral_code',v_code,'total_invites',v_total,
    'successful_referrals',v_qualified,'pending_referrals',v_pending,
    'points_balance',v_points,'points_earned',v_earned,
    'recent_referrals',v_recent,'points_history',v_history,
    'program_enabled',coalesce(v_settings.enabled,false),
    'leaderboard_enabled',coalesce(v_settings.leaderboard_enabled,false),
    'inviter_points',coalesce(v_settings.inviter_points,0),
    'invitee_points',coalesce(v_settings.invitee_points,0));
END;
$$;

CREATE OR REPLACE FUNCTION public.spike_referral_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE(user_id uuid,display_name text,username text,successful_referrals bigint,points_earned bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.spike_referral_settings WHERE singleton=true AND enabled=true AND leaderboard_enabled=true) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.inviter_id,coalesce(p.display_name,p.username,'SPIKE member')::text,p.username::text,
    count(*)::bigint,
    coalesce(sum(l.amount) FILTER(WHERE l.entry_type='referrer_reward'),0)::bigint
  FROM private.spike_referral_attributions a
  JOIN public.profiles p ON p.id=a.inviter_id
  LEFT JOIN private.spike_referral_point_ledger l ON l.user_id=a.inviter_id AND l.attribution_id=a.id AND l.entry_type='referrer_reward'
  WHERE a.status='qualified'
  GROUP BY a.inviter_id,p.display_name,p.username
  ORDER BY count(*) DESC,coalesce(sum(l.amount) FILTER(WHERE l.entry_type='referrer_reward'),0) DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.spike_referral_points_history(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,entry_type text,amount integer,reason text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  RETURN QUERY SELECT l.id,l.entry_type,l.amount,l.reason,l.created_at
  FROM private.spike_referral_point_ledger l WHERE l.user_id=v_uid
  ORDER BY l.created_at DESC LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION private.spike_referral_is_super_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_guard jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  v_guard := to_jsonb(public.admin_is_super_admin_self());
  RETURN v_guard = 'true'::jsonb OR v_guard @> '{"is_super_admin":true}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_spike_referral_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_settings private.spike_referral_settings; v_total bigint; v_qualified bigint; v_pending bigint; v_points bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_referral_is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING errcode='42501';
  END IF;
  SELECT * INTO v_settings FROM private.spike_referral_settings WHERE singleton=true;
  SELECT count(*),count(*) FILTER(WHERE status='qualified'),count(*) FILTER(WHERE status='pending')
  INTO v_total,v_qualified,v_pending FROM private.spike_referral_attributions;
  SELECT coalesce(sum(amount),0) INTO v_points FROM private.spike_referral_point_ledger;
  RETURN jsonb_build_object('enabled',v_settings.enabled,'leaderboard_enabled',v_settings.leaderboard_enabled,
    'inviter_points',v_settings.inviter_points,'invitee_points',v_settings.invitee_points,
    'total_referrals',v_total,'successful_referrals',v_qualified,'pending_referrals',v_pending,'points_issued',v_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_spike_referral_set_policy(
  p_enabled boolean,p_leaderboard_enabled boolean,p_inviter_points integer,p_invitee_points integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_referral_is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING errcode='42501';
  END IF;
  IF p_inviter_points IS NULL OR p_invitee_points IS NULL
     OR p_inviter_points NOT BETWEEN 0 AND 100000 OR p_invitee_points NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Referral point rewards must be between 0 and 100,000';
  END IF;
  UPDATE private.spike_referral_settings SET enabled=coalesce(p_enabled,false),
    leaderboard_enabled=coalesce(p_leaderboard_enabled,false),inviter_points=p_inviter_points,
    invitee_points=p_invitee_points,updated_by=auth.uid(),updated_at=now()
  WHERE singleton=true;
  INSERT INTO public.admin_audit(actor_id,action,role,details)
  VALUES(auth.uid(),'referral_policy_updated','admin',jsonb_build_object(
    'enabled',p_enabled,'leaderboard_enabled',p_leaderboard_enabled,
    'inviter_points',p_inviter_points,'invitee_points',p_invitee_points));
  IF p_enabled THEN
    PERFORM private.spike_referral_process_for_user(a.invitee_id)
    FROM private.spike_referral_attributions a WHERE a.status='pending';
  END IF;
  RETURN public.admin_spike_referral_overview();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_spike_referral_list(p_status text DEFAULT 'all',p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_referral_is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING errcode='42501';
  END IF;
  IF coalesce(p_status,'all') NOT IN ('all','pending','qualified','rejected') THEN RAISE EXCEPTION 'Invalid referral status'; END IF;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object('id',a.id,'status',a.status,'referral_code',a.referral_code,
      'created_at',a.created_at,'qualified_at',a.qualified_at,'points_awarded',a.points_awarded,
      'inviter_id',a.inviter_id,'inviter_name',coalesce(ip.display_name,ip.username,'SPIKE member'),
      'invitee_id',a.invitee_id,'invitee_name',coalesce(ep.display_name,ep.username,'SPIKE member')) AS x
    FROM private.spike_referral_attributions a
    LEFT JOIN public.profiles ip ON ip.id=a.inviter_id
    LEFT JOIN public.profiles ep ON ep.id=a.invitee_id
    WHERE coalesce(p_status,'all')='all' OR a.status=p_status
    ORDER BY a.created_at DESC LIMIT greatest(1,least(coalesce(p_limit,100),500))
  ) q;
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_spike_referral_ledger(p_limit integer DEFAULT 250)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_referral_is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING errcode='42501';
  END IF;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object('id',l.id,'user_id',l.user_id,
      'display_name',coalesce(p.display_name,p.username,'SPIKE member'),
      'attribution_id',l.attribution_id,'entry_type',l.entry_type,'amount',l.amount,
      'reason',l.reason,'created_at',l.created_at) AS x
    FROM private.spike_referral_point_ledger l
    LEFT JOIN public.profiles p ON p.id=l.user_id
    ORDER BY l.created_at DESC LIMIT greatest(1,least(coalesce(p_limit,250),500))
  ) q;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION private.spike_referral_is_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_referral_capture_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_referral_process_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_referral_profile_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_referral_auth_verified() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.spike_referral_capture_pending(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spike_referral_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spike_referral_leaderboard(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spike_referral_points_history(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_spike_referral_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_spike_referral_set_policy(boolean,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_spike_referral_list(text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_spike_referral_ledger(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_referral_capture_pending(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_referral_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_referral_leaderboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_referral_points_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spike_referral_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spike_referral_set_policy(boolean,boolean,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spike_referral_list(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spike_referral_ledger(integer) TO authenticated;

COMMIT;
