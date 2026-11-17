BEGIN;
CREATE OR REPLACE FUNCTION private.spike_user_is_restricted(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.restricted_at IS NOT NULL
    AND (p.restricted_until IS NULL OR p.restricted_until>now()));
$$;
REVOKE ALL ON FUNCTION private.spike_user_is_restricted(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.spike_request_creator_eligibility_review()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE v_uid uuid:=auth.uid(); v_profile public.profiles; v_wallet public.spike_creator_wallets; v_elig public.spike_creator_eligibility; v_available bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  IF NOT FOUND OR nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NULL THEN RAISE EXCEPTION 'A valid SPIKE SP ID is required'; END IF;
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Resolve your active SPIKE account restriction before requesting earnings eligibility'; END IF;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid;
  v_available:=coalesce(v_wallet.earned_balance,0)-coalesce(v_wallet.reserved_balance,0);
  IF v_available<=0 THEN RAISE EXCEPTION 'You need available legitimate creator earnings before requesting eligibility review'; END IF;
  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  IF FOUND AND v_elig.status='eligible' THEN RETURN jsonb_build_object('ok',true,'status','eligible','already_eligible',true); END IF;
  IF FOUND AND v_elig.status='suspended' THEN RAISE EXCEPTION 'Your creator eligibility is suspended. Contact SPIKE support for review'; END IF;
  IF FOUND AND v_elig.status='under_review' THEN RETURN jsonb_build_object('ok',true,'status','under_review','already_submitted',true); END IF;
  INSERT INTO public.spike_creator_eligibility(user_id,status,reviewed_by,reviewed_at,reason,updated_at)
  VALUES(v_uid,'under_review',NULL,NULL,'User requested SPIKE earnings eligibility review',now())
  ON CONFLICT(user_id) DO UPDATE SET status='under_review',reviewed_by=NULL,reviewed_at=NULL,reason='User requested SPIKE earnings eligibility review',updated_at=now();
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_uid,'creator_eligibility_review_submitted',jsonb_build_object('message','Your SPIKE earnings eligibility review request has been submitted.'),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(v_uid,'creator_eligibility_review_requested',v_uid,'user',jsonb_build_object('available_earned_sp_coins',v_available));
  RETURN jsonb_build_object('ok',true,'status','under_review','already_submitted',false);
END; $$;

CREATE OR REPLACE FUNCTION public.spike_creator_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE v_uid uuid:=auth.uid(); v_wallet public.spike_creator_wallets; v_policy public.spike_creator_withdrawal_policy;
        v_elig public.spike_creator_eligibility; v_account public.spike_creator_payout_accounts; v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  SELECT * INTO v_account FROM public.spike_creator_payout_accounts WHERE user_id=v_uid;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  RETURN jsonb_build_object('earned_balance',coalesce(v_wallet.earned_balance,0),'reserved_balance',coalesce(v_wallet.reserved_balance,0),
    'available_balance',coalesce(v_wallet.earned_balance,0)-coalesce(v_wallet.reserved_balance,0),'withdrawal_enabled',coalesce(v_policy.enabled,false),
    'minimum_earned_units',v_policy.minimum_earned_units,'naira_per_earned_unit',v_policy.naira_per_earned_unit,'fee_bps',v_policy.fee_bps,
    'eligibility_status',coalesce(v_elig.status,'under_review'),'eligibility_requested',v_elig.user_id IS NOT NULL,'eligibility_reason',v_elig.reason,
    'payout_account_verified',coalesce(v_account.verified,false),'payout_bank_name',v_account.bank_name,
    'has_valid_sp_id',nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NOT NULL,'account_restricted',private.spike_user_is_restricted(v_uid));
END; $$;

CREATE OR REPLACE FUNCTION public.spike_creator_request_withdrawal(p_earned_units bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE v_uid uuid:=auth.uid(); v_wallet public.spike_creator_wallets; v_policy public.spike_creator_withdrawal_policy;
        v_account public.spike_creator_payout_accounts; v_elig public.spike_creator_eligibility; v_profile public.profiles;
        v_gross bigint; v_fee bigint; v_net bigint; v_ref text; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_earned_units IS NULL OR p_earned_units<=0 THEN RAISE EXCEPTION 'Withdrawal amount must be positive'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  IF NOT FOUND OR nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NULL THEN RAISE EXCEPTION 'A valid SPIKE SP ID is required before withdrawing earnings'; END IF;
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your active SPIKE account restriction prevents earnings withdrawal'; END IF;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  IF NOT coalesce(v_policy.enabled,false) OR v_policy.minimum_earned_units IS NULL OR v_policy.naira_per_earned_unit IS NULL OR v_policy.fee_bps IS NULL THEN RAISE EXCEPTION 'Creator withdrawals are not yet enabled by SPIKE Owner'; END IF;
  IF p_earned_units<v_policy.minimum_earned_units THEN RAISE EXCEPTION 'Below the configured minimum withdrawal'; END IF;
  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  IF coalesce(v_elig.status,'under_review')<>'eligible' THEN RAISE EXCEPTION 'SPIKE earnings eligibility approval is required'; END IF;
  SELECT * INTO v_account FROM public.spike_creator_payout_accounts WHERE user_id=v_uid;
  IF NOT FOUND OR NOT v_account.verified THEN RAISE EXCEPTION 'A verified bank account is required'; END IF;
  INSERT INTO public.spike_creator_wallets(user_id) VALUES(v_uid) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid FOR UPDATE;
  IF v_wallet.earned_balance-v_wallet.reserved_balance<p_earned_units THEN RAISE EXCEPTION 'Insufficient available earned SP Coins'; END IF;
  v_gross:=floor(p_earned_units*v_policy.naira_per_earned_unit*100)::bigint;
  v_fee:=floor(v_gross*v_policy.fee_bps/10000.0)::bigint; v_net:=v_gross-v_fee;
  IF v_net<=0 THEN RAISE EXCEPTION 'Net withdrawal amount must be positive'; END IF;
  v_ref:='SPW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  UPDATE public.spike_creator_wallets SET reserved_balance=reserved_balance+p_earned_units,updated_at=now() WHERE user_id=v_uid;
  INSERT INTO public.spike_creator_withdrawals(user_id,reference,earned_units,gross_amount_minor,fee_amount_minor,net_amount_minor,bank_name_snapshot,account_name_snapshot,account_number_snapshot)
  VALUES(v_uid,v_ref,p_earned_units,v_gross,v_fee,v_net,v_account.bank_name,v_account.account_name,v_account.account_number) RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_uid,'creator_withdrawal_submitted',jsonb_build_object('reference',v_ref,'earned_units',p_earned_units,'net_amount_minor',v_net,'currency','NGN'),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(v_uid,'creator_withdrawal_requested',v_uid,'user',jsonb_build_object('withdrawal_id',v_id,'reference',v_ref,'earned_sp_coins',p_earned_units,'gross_amount_minor',v_gross,'fee_amount_minor',v_fee,'net_amount_minor',v_net));
  RETURN jsonb_build_object('ok',true,'id',v_id,'reference',v_ref,'status','pending','gross_amount_minor',v_gross,'fee_amount_minor',v_fee,'net_amount_minor',v_net,'currency','NGN');
END; $$;

CREATE OR REPLACE FUNCTION private.spike_create_verified_subscription(p_plan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_spid text; v_id uuid; v_ref text; v_amount bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_plan NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'Choose a valid monthly or yearly plan'; END IF;
  SELECT sp_id INTO v_spid FROM public.profiles WHERE id=v_uid;
  IF nullif(trim(coalesce(v_spid,'')),'') IS NULL THEN RAISE EXCEPTION 'A valid SPIKE SP ID is required before requesting verification'; END IF;
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your active SPIKE account restriction prevents a Verified subscription request'; END IF;
  IF EXISTS(SELECT 1 FROM private.spike_verified_subscriptions WHERE user_id=v_uid AND status IN ('pending_payment','payment_reported','awaiting_identity')) THEN RAISE EXCEPTION 'You already have an unresolved SPIKE Verified subscription request'; END IF;
  v_amount:=CASE WHEN p_plan='monthly' THEN 150000 ELSE 1500000 END;
  v_ref:='SPV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  INSERT INTO private.spike_verified_identities(user_id,status) VALUES(v_uid,'pending') ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO private.spike_verified_subscriptions(user_id,reference,plan,amount_minor,currency) VALUES(v_uid,v_ref,p_plan,v_amount,'NGN') RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_uid,'verified_subscription_request_created',jsonb_build_object('reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN'),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(v_uid,'verified_subscription_request_created',v_uid,'user',jsonb_build_object('subscription_id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount));
  RETURN jsonb_build_object('ok',true,'id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN','status','pending_payment');
END; $$;

CREATE OR REPLACE FUNCTION private.spike_activate_verified_subscription(p_subscription_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_sub private.spike_verified_subscriptions; v_identity private.spike_verified_identities; v_previous_expiry timestamptz; v_start timestamptz; v_expiry timestamptz;
BEGIN
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.payment_status<>'approved' OR v_sub.status IN ('rejected','revoked','expired') THEN RETURN jsonb_build_object('activated',false,'reason','payment_not_approved'); END IF;
  SELECT * INTO v_identity FROM private.spike_verified_identities WHERE user_id=v_sub.user_id;
  IF NOT FOUND OR v_identity.status<>'approved' THEN UPDATE private.spike_verified_subscriptions SET status='awaiting_identity',updated_at=now() WHERE id=v_sub.id; RETURN jsonb_build_object('activated',false,'reason','identity_review_required'); END IF;
  IF private.spike_user_is_restricted(v_sub.user_id) THEN UPDATE private.spike_verified_subscriptions SET status='awaiting_identity',updated_at=now() WHERE id=v_sub.id; RETURN jsonb_build_object('activated',false,'reason','account_restricted'); END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  SELECT max(expires_at) INTO v_previous_expiry FROM private.spike_verified_subscriptions WHERE user_id=v_sub.user_id AND id<>v_sub.id AND status='active' AND expires_at>now();
  v_start:=greatest(now(),coalesce(v_previous_expiry,now()));
  v_expiry:=v_start+CASE WHEN v_sub.plan='monthly' THEN interval '30 days' ELSE interval '365 days' END;
  UPDATE private.spike_verified_subscriptions SET status='active',starts_at=v_start,expires_at=v_expiry,updated_at=now() WHERE id=v_sub.id;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_sub.user_id,'verified_subscription_activated',jsonb_build_object('reference',v_sub.reference,'plan',v_sub.plan,'starts_at',v_start,'expires_at',v_expiry,'message','Your SPIKE Verified badge is now active.'),'high');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(coalesce(v_sub.decided_by,v_identity.reviewed_by),'verified_subscription_activated',v_sub.user_id,'owner',jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'plan',v_sub.plan,'starts_at',v_start,'expires_at',v_expiry));
  RETURN jsonb_build_object('activated',true,'starts_at',v_start,'expires_at',v_expiry);
END; $$;

CREATE OR REPLACE FUNCTION private.admin_review_verified_identity(p_user_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),''); v_sub private.spike_verified_subscriptions; v_activation jsonb; v_status text; v_message text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_decision NOT IN ('approve','reject','revoke') THEN RAISE EXCEPTION 'Invalid identity decision'; END IF;
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'SPIKE user not found'; END IF;
  IF p_decision IN ('reject','revoke') AND v_reason IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_decision='approve' AND private.spike_user_is_restricted(p_user_id) THEN RAISE EXCEPTION 'A restricted SPIKE account cannot receive a Verified badge'; END IF;
  v_status:=CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'revoked' END;
  INSERT INTO private.spike_verified_identities(user_id,status,reviewed_by,reviewed_at,reason,updated_at) VALUES(p_user_id,v_status,auth.uid(),now(),v_reason,now())
  ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,reason=excluded.reason,updated_at=now();
  IF p_decision IN ('reject','revoke') THEN UPDATE private.spike_verified_subscriptions SET status='revoked',updated_at=now() WHERE user_id=p_user_id AND status='active';
  ELSE SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE user_id=p_user_id AND payment_status='approved' AND status='awaiting_identity' ORDER BY created_at DESC LIMIT 1 FOR UPDATE; IF FOUND THEN v_activation:=private.spike_activate_verified_subscription(v_sub.id); END IF; END IF;
  v_message:=CASE p_decision WHEN 'approve' THEN 'Your SPIKE identity review was approved.' WHEN 'reject' THEN 'Your SPIKE identity review was rejected. Reason: '||coalesce(v_reason,'Not provided') ELSE 'Your SPIKE identity verification was revoked. Reason: '||coalesce(v_reason,'Not provided') END;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(p_user_id,'verified_identity_'||CASE WHEN p_decision='approve' THEN 'approved' WHEN p_decision='reject' THEN 'rejected' ELSE 'revoked' END,jsonb_build_object('reason',v_reason,'message',v_message),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'verified_identity_'||p_decision,p_user_id,'owner',jsonb_build_object('reason',v_reason,'activation',v_activation));
  RETURN jsonb_build_object('ok',true,'identity_status',v_status,'activation',v_activation);
END; $$;

CREATE OR REPLACE FUNCTION public.spike_my_verified_subscription_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_identity private.spike_verified_identities; v_sub private.spike_verified_subscriptions; v_restricted boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  SELECT * INTO v_identity FROM private.spike_verified_identities WHERE user_id=auth.uid();
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE user_id=auth.uid() AND status='active' AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
  v_restricted:=private.spike_user_is_restricted(auth.uid());
  RETURN jsonb_build_object('identity_status',coalesce(v_identity.status,'pending'),'identity_reason',v_identity.reason,
    'is_verified',v_sub.id IS NOT NULL AND v_identity.status='approved' AND NOT v_restricted,'account_restricted',v_restricted,
    'plan',v_sub.plan,'starts_at',v_sub.starts_at,'expires_at',v_sub.expires_at,'reference',v_sub.reference);
END; $$;

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids uuid[])
RETURNS TABLE(id uuid,username text,display_name text,avatar_url text,bio text,website text,sp_id text,created_at timestamptz,verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
WITH me AS (SELECT (SELECT auth.uid()) AS uid)
SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.created_at,
  (NOT private.spike_user_is_restricted(p.id) AND (p.verified OR EXISTS(SELECT 1 FROM private.spike_verified_subscriptions s JOIN private.spike_verified_identities i ON i.user_id=s.user_id
    WHERE s.user_id=p.id AND s.status='active' AND s.expires_at>now() AND i.status='approved'))) AS verified
FROM public.profiles p CROSS JOIN me
WHERE me.uid IS NOT NULL AND coalesce(cardinality(p_user_ids),0)<=500 AND p.id=ANY(coalesce(p_user_ids,'{}'::uuid[]))
AND (p.id=me.uid OR (NOT EXISTS(SELECT 1 FROM public.private_message_blocks b WHERE (b.blocker_id=me.uid AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=me.uid))
AND (public.can_view_spike_profile(me.uid,p.id) OR EXISTS(SELECT 1 FROM public.private_messages pm WHERE (pm.sender_id=me.uid AND pm.recipient_id=p.id) OR (pm.recipient_id=me.uid AND pm.sender_id=p.id)))));
$$;
CREATE OR REPLACE FUNCTION public.get_qr_connect_profile(p_user_id uuid)
RETURNS TABLE(id uuid,username text,display_name text,avatar_url text,bio text,website text,sp_id text,created_at timestamptz,verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.created_at,
  (NOT private.spike_user_is_restricted(p.id) AND (p.verified OR EXISTS(SELECT 1 FROM private.spike_verified_subscriptions s JOIN private.spike_verified_identities i ON i.user_id=s.user_id
    WHERE s.user_id=p.id AND s.status='active' AND s.expires_at>now() AND i.status='approved'))) AS verified
FROM public.profiles p WHERE auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p.id=p_user_id AND p.id<>auth.uid() AND public.can_discover_spike_profile(auth.uid(),p.id);
$$;
COMMIT;
