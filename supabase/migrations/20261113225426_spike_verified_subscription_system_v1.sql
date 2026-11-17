BEGIN;

CREATE TABLE IF NOT EXISTS private.spike_verified_identities (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.spike_verified_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  plan text NOT NULL CHECK (plan IN ('monthly','yearly')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','payment_reported','approved','rejected')),
  payment_reference text,
  payment_rejection_reason text,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','payment_reported','awaiting_identity','active','expired','rejected','revoked')),
  starts_at timestamptz,
  expires_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS spike_verified_payment_reference_uidx
  ON private.spike_verified_subscriptions(lower(payment_reference)) WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS spike_verified_one_open_request_per_user_uidx
  ON private.spike_verified_subscriptions(user_id)
  WHERE status IN ('pending_payment','payment_reported','awaiting_identity');
CREATE INDEX IF NOT EXISTS spike_verified_user_history_idx
  ON private.spike_verified_subscriptions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS spike_verified_expiry_idx
  ON private.spike_verified_subscriptions(expires_at) WHERE status='active';
ALTER TABLE private.spike_verified_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.spike_verified_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.spike_verified_identities, private.spike_verified_subscriptions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.spike_expire_verified_subscriptions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row record; v_count integer:=0;
BEGIN
  FOR v_row IN
    UPDATE private.spike_verified_subscriptions SET status='expired',updated_at=now()
    WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=now()
    RETURNING id,user_id,reference,expires_at
  LOOP
    v_count:=v_count+1;
    INSERT INTO public.notifications(user_id,type,data,priority)
    VALUES(v_row.user_id,'verified_subscription_expired',
      jsonb_build_object('reference',v_row.reference,'expired_at',v_row.expires_at,'message','Your SPIKE Verified subscription has expired.'),'normal');
  END LOOP;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION private.spike_activate_verified_subscription(p_subscription_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sub private.spike_verified_subscriptions; v_identity private.spike_verified_identities;
        v_previous_expiry timestamptz; v_start timestamptz; v_expiry timestamptz;
BEGIN
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.payment_status<>'approved' OR v_sub.status IN ('rejected','revoked','expired') THEN
    RETURN jsonb_build_object('activated',false,'reason','payment_not_approved');
  END IF;
  SELECT * INTO v_identity FROM private.spike_verified_identities WHERE user_id=v_sub.user_id;
  IF NOT FOUND OR v_identity.status<>'approved' THEN
    UPDATE private.spike_verified_subscriptions SET status='awaiting_identity',updated_at=now() WHERE id=v_sub.id;
    RETURN jsonb_build_object('activated',false,'reason','identity_review_required');
  END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  SELECT max(expires_at) INTO v_previous_expiry FROM private.spike_verified_subscriptions
  WHERE user_id=v_sub.user_id AND id<>v_sub.id AND status='active' AND expires_at>now();
  v_start:=greatest(now(),coalesce(v_previous_expiry,now()));
  v_expiry:=v_start+CASE WHEN v_sub.plan='monthly' THEN interval '30 days' ELSE interval '365 days' END;
  UPDATE private.spike_verified_subscriptions SET status='active',starts_at=v_start,expires_at=v_expiry,updated_at=now() WHERE id=v_sub.id;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_sub.user_id,'verified_subscription_activated',
    jsonb_build_object('reference',v_sub.reference,'plan',v_sub.plan,'starts_at',v_start,'expires_at',v_expiry,'message','Your SPIKE Verified badge is now active.'),'high');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(coalesce(v_sub.decided_by,v_identity.reviewed_by),'verified_subscription_activated',v_sub.user_id,'owner',
    jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'plan',v_sub.plan,'starts_at',v_start,'expires_at',v_expiry));
  RETURN jsonb_build_object('activated',true,'starts_at',v_start,'expires_at',v_expiry);
END; $$;

CREATE OR REPLACE FUNCTION private.spike_create_verified_subscription(p_plan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_spid text; v_id uuid; v_ref text; v_amount bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_plan NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'Choose a valid monthly or yearly plan'; END IF;
  SELECT sp_id INTO v_spid FROM public.profiles WHERE id=v_uid;
  IF nullif(trim(coalesce(v_spid,'')),'') IS NULL THEN RAISE EXCEPTION 'A valid SPIKE SP ID is required before requesting verification'; END IF;
  IF EXISTS(SELECT 1 FROM private.spike_verified_subscriptions WHERE user_id=v_uid AND status IN ('pending_payment','payment_reported','awaiting_identity')) THEN
    RAISE EXCEPTION 'You already have an unresolved SPIKE Verified subscription request';
  END IF;
  v_amount:=CASE WHEN p_plan='monthly' THEN 150000 ELSE 1500000 END;
  v_ref:='SPV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  INSERT INTO private.spike_verified_identities(user_id,status) VALUES(v_uid,'pending') ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO private.spike_verified_subscriptions(user_id,reference,plan,amount_minor,currency)
  VALUES(v_uid,v_ref,p_plan,v_amount,'NGN') RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_uid,'verified_subscription_request_created',jsonb_build_object('reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN'),'normal');
  RETURN jsonb_build_object('ok',true,'id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN','status','pending_payment');
END; $$;

CREATE OR REPLACE FUNCTION private.spike_report_verified_subscription_payment(p_subscription_id uuid,p_payment_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_sub private.spike_verified_subscriptions; v_ref text:=nullif(trim(p_payment_reference),'');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_subscription_id IS NULL OR v_ref IS NULL OR length(v_ref)<3 OR length(v_ref)>120 THEN
    RAISE EXCEPTION 'Enter a valid bank transfer reference (3–120 characters)';
  END IF;
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription request not found'; END IF;
  IF lower(v_ref)=lower(v_sub.reference) THEN RAISE EXCEPTION 'Enter the bank transfer reference, not your SPIKE subscription reference'; END IF;
  IF EXISTS(SELECT 1 FROM public.coin_orders WHERE lower(coalesce(payment_reference,''))=lower(v_ref)) THEN
    RAISE EXCEPTION 'This bank transfer reference has already been used for another SPIKE payment';
  END IF;
  IF v_sub.status<>'pending_payment' OR v_sub.payment_status<>'pending' THEN RAISE EXCEPTION 'Only a pending subscription payment can be reported'; END IF;
  UPDATE private.spike_verified_subscriptions SET payment_status='payment_reported',payment_reference=v_ref,status='payment_reported',updated_at=now() WHERE id=v_sub.id;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_uid,'verified_subscription_payment_reported',jsonb_build_object('reference',v_sub.reference,'plan',v_sub.plan,'payment_reference',v_ref),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(v_uid,'verified_subscription_payment_reported',v_uid,'user',jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'plan',v_sub.plan));
  RETURN jsonb_build_object('ok',true,'reference',v_sub.reference,'status','payment_reported');
END; $$;

CREATE OR REPLACE FUNCTION private.admin_decide_verified_subscription_payment(p_subscription_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sub private.spike_verified_subscriptions; v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),''); v_activation jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Decision must be approve or reject'; END IF;
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.payment_status<>'payment_reported' THEN RAISE EXCEPTION 'Payment-reported subscription request not found'; END IF;
  IF p_decision='reject' AND v_reason IS NULL THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  IF p_decision='reject' THEN
    UPDATE private.spike_verified_subscriptions SET payment_status='rejected',status='rejected',payment_rejection_reason=v_reason,decided_by=auth.uid(),decided_at=now(),updated_at=now() WHERE id=v_sub.id;
    INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_sub.user_id,'verified_subscription_payment_rejected',jsonb_build_object('reference',v_sub.reference,'reason',v_reason),'normal');
  ELSE
    UPDATE private.spike_verified_subscriptions SET payment_status='approved',status='awaiting_identity',decided_by=auth.uid(),decided_at=now(),updated_at=now() WHERE id=v_sub.id;
    INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_sub.user_id,'verified_subscription_payment_approved',jsonb_build_object('reference',v_sub.reference,'message','Payment verified. SPIKE identity review is the remaining step, unless already approved.'),'normal');
    v_activation:=private.spike_activate_verified_subscription(v_sub.id);
  END IF;
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'verified_subscription_payment_'||p_decision,v_sub.user_id,'owner',jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'reason',v_reason));
  RETURN jsonb_build_object('ok',true,'status',CASE WHEN p_decision='approve' THEN coalesce(v_activation->>'reason','awaiting_identity') ELSE 'rejected' END,'activation',v_activation);
END; $$;

CREATE OR REPLACE FUNCTION private.admin_review_verified_identity(p_user_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),''); v_sub private.spike_verified_subscriptions; v_activation jsonb; v_status text; v_message text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_decision NOT IN ('approve','reject','revoke') THEN RAISE EXCEPTION 'Invalid identity decision'; END IF;
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'SPIKE user not found'; END IF;
  IF p_decision IN ('reject','revoke') AND v_reason IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_status:=CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'revoked' END;
  INSERT INTO private.spike_verified_identities(user_id,status,reviewed_by,reviewed_at,reason,updated_at)
  VALUES(p_user_id,v_status,auth.uid(),now(),v_reason,now())
  ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,reason=excluded.reason,updated_at=now();
  IF p_decision IN ('reject','revoke') THEN
    UPDATE private.spike_verified_subscriptions SET status='revoked',updated_at=now() WHERE user_id=p_user_id AND status='active';
  ELSE
    SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE user_id=p_user_id AND payment_status='approved' AND status='awaiting_identity' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN v_activation:=private.spike_activate_verified_subscription(v_sub.id); END IF;
  END IF;
  v_message:=CASE p_decision WHEN 'approve' THEN 'Your SPIKE identity review was approved.' WHEN 'reject' THEN 'Your SPIKE identity review was rejected. Reason: '||coalesce(v_reason,'Not provided') ELSE 'Your SPIKE identity verification was revoked. Reason: '||coalesce(v_reason,'Not provided') END;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(p_user_id,'verified_identity_'||CASE WHEN p_decision='approve' THEN 'approved' WHEN p_decision='reject' THEN 'rejected' ELSE 'revoked' END,jsonb_build_object('reason',v_reason,'message',v_message),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'verified_identity_'||p_decision,p_user_id,'owner',jsonb_build_object('reason',v_reason,'activation',v_activation));
  RETURN jsonb_build_object('ok',true,'identity_status',v_status,'activation',v_activation);
END; $$;

CREATE OR REPLACE FUNCTION private.admin_revoke_verified_subscription(p_subscription_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sub private.spike_verified_subscriptions; v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),'');
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A revocation reason is required'; END IF;
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.status NOT IN ('active','awaiting_identity') THEN RAISE EXCEPTION 'Active or awaiting-identity subscription not found'; END IF;
  UPDATE private.spike_verified_subscriptions SET status='revoked',payment_rejection_reason=v_reason,decided_by=auth.uid(),decided_at=now(),updated_at=now() WHERE id=v_sub.id;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_sub.user_id,'verified_subscription_revoked',jsonb_build_object('reference',v_sub.reference,'reason',v_reason),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'verified_subscription_revoked',v_sub.user_id,'owner',jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'reason',v_reason));
  RETURN jsonb_build_object('ok',true,'status','revoked');
END; $$;

CREATE OR REPLACE FUNCTION public.spike_create_verified_subscription(p_plan text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private.spike_create_verified_subscription(p_plan); $$;
CREATE OR REPLACE FUNCTION public.spike_report_verified_subscription_payment(p_subscription_id uuid,p_payment_reference text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private.spike_report_verified_subscription_payment(p_subscription_id,p_payment_reference); $$;
CREATE OR REPLACE FUNCTION public.spike_my_verified_subscriptions()
RETURNS TABLE(id uuid,reference text,plan text,amount_minor bigint,currency text,payment_status text,payment_reference text,identity_status text,status text,starts_at timestamptz,expires_at timestamptz,created_at timestamptz,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  RETURN QUERY SELECT s.id,s.reference,s.plan,s.amount_minor,s.currency,s.payment_status,s.payment_reference,
    coalesce(i.status,'pending'),s.status,s.starts_at,s.expires_at,s.created_at,coalesce(s.payment_rejection_reason,i.reason)
  FROM private.spike_verified_subscriptions s LEFT JOIN private.spike_verified_identities i ON i.user_id=s.user_id
  WHERE s.user_id=auth.uid() ORDER BY s.created_at DESC LIMIT 30;
END; $$;
CREATE OR REPLACE FUNCTION public.spike_my_verified_subscription_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_identity private.spike_verified_identities; v_sub private.spike_verified_subscriptions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  SELECT * INTO v_identity FROM private.spike_verified_identities WHERE user_id=auth.uid();
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE user_id=auth.uid() AND status='active' AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
  RETURN jsonb_build_object('identity_status',coalesce(v_identity.status,'pending'),'identity_reason',v_identity.reason,
    'is_verified',v_sub.id IS NOT NULL AND v_identity.status='approved','plan',v_sub.plan,'starts_at',v_sub.starts_at,'expires_at',v_sub.expires_at,'reference',v_sub.reference);
END; $$;
CREATE OR REPLACE FUNCTION public.admin_list_verified_subscriptions(p_status text DEFAULT NULL)
RETURNS TABLE(id uuid,user_id uuid,sp_id text,display_name text,username text,reference text,plan text,amount_minor bigint,currency text,payment_status text,payment_reference text,identity_status text,status text,starts_at timestamptz,expires_at timestamptz,created_at timestamptz,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  IF p_status IS NOT NULL AND p_status NOT IN ('pending_payment','payment_reported','awaiting_identity','active','expired','rejected','revoked') THEN RAISE EXCEPTION 'Invalid subscription queue'; END IF;
  RETURN QUERY SELECT s.id,s.user_id,p.sp_id,p.display_name,p.username,s.reference,s.plan,s.amount_minor,s.currency,s.payment_status,s.payment_reference,
    coalesce(i.status,'pending'),s.status,s.starts_at,s.expires_at,s.created_at,coalesce(s.payment_rejection_reason,i.reason)
  FROM private.spike_verified_subscriptions s JOIN public.profiles p ON p.id=s.user_id
  LEFT JOIN private.spike_verified_identities i ON i.user_id=s.user_id
  WHERE p_status IS NULL OR s.status=p_status ORDER BY s.created_at DESC LIMIT 500;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_decide_verified_subscription_payment(p_subscription_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private.admin_decide_verified_subscription_payment(p_subscription_id,p_decision,p_reason); $$;
CREATE OR REPLACE FUNCTION public.admin_review_verified_identity(p_user_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private.admin_review_verified_identity(p_user_id,p_decision,p_reason); $$;
CREATE OR REPLACE FUNCTION public.admin_revoke_verified_subscription(p_subscription_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private.admin_revoke_verified_subscription(p_subscription_id,p_reason); $$;

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids uuid[])
RETURNS TABLE(id uuid,username text,display_name text,avatar_url text,bio text,website text,sp_id text,created_at timestamptz,verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
WITH me AS (SELECT (SELECT auth.uid()) AS uid)
SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.created_at,
  (p.verified OR EXISTS(SELECT 1 FROM private.spike_verified_subscriptions s JOIN private.spike_verified_identities i ON i.user_id=s.user_id
    WHERE s.user_id=p.id AND s.status='active' AND s.expires_at>now() AND i.status='approved')) AS verified
FROM public.profiles p CROSS JOIN me
WHERE me.uid IS NOT NULL AND coalesce(cardinality(p_user_ids),0)<=500 AND p.id=ANY(coalesce(p_user_ids,'{}'::uuid[]))
AND (p.id=me.uid OR (NOT EXISTS(SELECT 1 FROM public.private_message_blocks b WHERE (b.blocker_id=me.uid AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=me.uid))
AND (public.can_view_spike_profile(me.uid,p.id) OR EXISTS(SELECT 1 FROM public.private_messages pm WHERE (pm.sender_id=me.uid AND pm.recipient_id=p.id) OR (pm.recipient_id=me.uid AND pm.sender_id=p.id)))));
$$;
CREATE OR REPLACE FUNCTION public.get_qr_connect_profile(p_user_id uuid)
RETURNS TABLE(id uuid,username text,display_name text,avatar_url text,bio text,website text,sp_id text,created_at timestamptz,verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.created_at,
  (p.verified OR EXISTS(SELECT 1 FROM private.spike_verified_subscriptions s JOIN private.spike_verified_identities i ON i.user_id=s.user_id
    WHERE s.user_id=p.id AND s.status='active' AND s.expires_at>now() AND i.status='approved')) AS verified
FROM public.profiles p WHERE auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p.id=p_user_id AND p.id<>auth.uid() AND public.can_discover_spike_profile(auth.uid(),p.id);
$$;

REVOKE ALL ON FUNCTION private.spike_expire_verified_subscriptions() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.spike_activate_verified_subscription(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.spike_create_verified_subscription(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.spike_report_verified_subscription_payment(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.admin_decide_verified_subscription_payment(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.admin_review_verified_identity(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.admin_revoke_verified_subscription(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spike_create_verified_subscription(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.spike_create_verified_subscription(text) TO authenticated;
REVOKE ALL ON FUNCTION public.spike_report_verified_subscription_payment(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.spike_report_verified_subscription_payment(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.spike_my_verified_subscriptions() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.spike_my_verified_subscriptions() TO authenticated;
REVOKE ALL ON FUNCTION public.spike_my_verified_subscription_status() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.spike_my_verified_subscription_status() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_verified_subscriptions(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_list_verified_subscriptions(text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_verified_subscription_payment(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_decide_verified_subscription_payment(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_review_verified_identity(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_review_verified_identity(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_verified_subscription(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_revoke_verified_subscription(uuid,text) TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $cron$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname='spike-verified-subscription-expiry';
  IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
  PERFORM cron.schedule('spike-verified-subscription-expiry','* * * * *','select private.spike_expire_verified_subscriptions();');
END
$cron$;

COMMIT;
