BEGIN;

CREATE OR REPLACE FUNCTION private.spike_request_creator_eligibility_review()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE v_uid uuid:=auth.uid(); v_profile public.profiles; v_wallet public.spike_creator_wallets; v_elig public.spike_creator_eligibility; v_available bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  IF NOT FOUND OR nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NULL THEN RAISE EXCEPTION 'A valid SPIKE SP ID is required'; END IF;
  IF v_profile.restricted_until IS NOT NULL AND v_profile.restricted_until>now() THEN
    RAISE EXCEPTION 'Resolve your active SPIKE account restriction before requesting earnings eligibility';
  END IF;
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
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_uid,'creator_eligibility_review_submitted',jsonb_build_object('message','Your SPIKE earnings eligibility review request has been submitted.'),'normal');
  RETURN jsonb_build_object('ok',true,'status','under_review','already_submitted',false);
END; $$;

CREATE OR REPLACE FUNCTION public.spike_creator_request_eligibility_review()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.spike_request_creator_eligibility_review(); $$;
REVOKE ALL ON FUNCTION private.spike_request_creator_eligibility_review() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spike_creator_request_eligibility_review() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_request_eligibility_review() TO authenticated;

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
  RETURN jsonb_build_object(
    'earned_balance',coalesce(v_wallet.earned_balance,0),
    'reserved_balance',coalesce(v_wallet.reserved_balance,0),
    'available_balance',coalesce(v_wallet.earned_balance,0)-coalesce(v_wallet.reserved_balance,0),
    'withdrawal_enabled',coalesce(v_policy.enabled,false),
    'minimum_earned_units',v_policy.minimum_earned_units,
    'naira_per_earned_unit',v_policy.naira_per_earned_unit,
    'fee_bps',v_policy.fee_bps,
    'eligibility_status',coalesce(v_elig.status,'under_review'),
    'eligibility_requested',v_elig.user_id IS NOT NULL,
    'eligibility_reason',v_elig.reason,
    'payout_account_verified',coalesce(v_account.verified,false),
    'payout_bank_name',v_account.bank_name,
    'has_valid_sp_id',nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NOT NULL,
    'account_restricted',coalesce(v_profile.restricted_until>now(),false)
  );
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
  IF v_profile.restricted_until IS NOT NULL AND v_profile.restricted_until>now() THEN RAISE EXCEPTION 'Your active SPIKE account restriction prevents earnings withdrawal'; END IF;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  IF NOT coalesce(v_policy.enabled,false) OR v_policy.minimum_earned_units IS NULL OR v_policy.naira_per_earned_unit IS NULL OR v_policy.fee_bps IS NULL THEN
    RAISE EXCEPTION 'Creator withdrawals are not yet enabled by SPIKE Owner';
  END IF;
  IF p_earned_units<v_policy.minimum_earned_units THEN RAISE EXCEPTION 'Below the configured minimum withdrawal'; END IF;
  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  IF coalesce(v_elig.status,'under_review')<>'eligible' THEN RAISE EXCEPTION 'SPIKE earnings eligibility approval is required'; END IF;
  SELECT * INTO v_account FROM public.spike_creator_payout_accounts WHERE user_id=v_uid;
  IF NOT FOUND OR NOT v_account.verified THEN RAISE EXCEPTION 'A verified bank account is required'; END IF;
  INSERT INTO public.spike_creator_wallets(user_id) VALUES(v_uid) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid FOR UPDATE;
  IF v_wallet.earned_balance-v_wallet.reserved_balance<p_earned_units THEN RAISE EXCEPTION 'Insufficient available earned SP Coins'; END IF;
  v_gross:=floor(p_earned_units*v_policy.naira_per_earned_unit*100)::bigint;
  v_fee:=floor(v_gross*v_policy.fee_bps/10000.0)::bigint;
  v_net:=v_gross-v_fee;
  IF v_net<=0 THEN RAISE EXCEPTION 'Net withdrawal amount must be positive'; END IF;
  v_ref:='SPW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  UPDATE public.spike_creator_wallets SET reserved_balance=reserved_balance+p_earned_units,updated_at=now() WHERE user_id=v_uid;
  INSERT INTO public.spike_creator_withdrawals(user_id,reference,earned_units,gross_amount_minor,fee_amount_minor,net_amount_minor,bank_name_snapshot,account_name_snapshot,account_number_snapshot)
  VALUES(v_uid,v_ref,p_earned_units,v_gross,v_fee,v_net,v_account.bank_name,v_account.account_name,v_account.account_number) RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_uid,'creator_withdrawal_submitted',jsonb_build_object('reference',v_ref,'earned_units',p_earned_units,'net_amount_minor',v_net,'currency','NGN'),'normal');
  RETURN jsonb_build_object('ok',true,'id',v_id,'reference',v_ref,'status','pending','gross_amount_minor',v_gross,'fee_amount_minor',v_fee,'net_amount_minor',v_net,'currency','NGN');
END; $$;

REVOKE ALL ON FUNCTION public.spike_creator_wallet_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_wallet_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.spike_creator_request_withdrawal(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_request_withdrawal(bigint) TO authenticated;
COMMIT;
