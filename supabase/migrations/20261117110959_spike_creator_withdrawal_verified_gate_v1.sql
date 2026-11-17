-- Keep creator earnings accrual and wallet visibility independent of verification and withdrawal eligibility.
-- Only the withdrawal request is gated: the account must have active SPIKE Verified membership
-- and the existing Owner-approved eligibility, bank, SP ID, restriction, balance and schedule checks.
BEGIN;

CREATE OR REPLACE FUNCTION public.spike_creator_request_withdrawal(p_earned_units bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wallet public.spike_creator_wallets;
  v_policy public.spike_creator_withdrawal_policy;
  v_account public.spike_creator_payout_accounts;
  v_elig public.spike_creator_eligibility;
  v_profile public.profiles;
  v_local_now timestamp without time zone;
  v_local_time time;
  v_amount_minor bigint;
  v_usd_minor bigint;
  v_ref text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_earned_units IS NULL OR p_earned_units<=0 THEN RAISE EXCEPTION 'Withdrawal amount must be positive'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  IF NOT FOUND OR nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NULL THEN RAISE EXCEPTION 'A valid SPIKE SP ID is required before withdrawing earnings'; END IF;
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your active SPIKE account restriction prevents earnings withdrawal'; END IF;
  IF NOT private.spike_user_has_active_verified_subscription(v_uid) THEN
    RAISE EXCEPTION 'An active SPIKE Verified membership is required before withdrawing earnings';
  END IF;

  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  IF NOT coalesce(v_policy.enabled,false) OR v_policy.minimum_earned_units IS NULL
     OR v_policy.maximum_earned_units IS NULL OR v_policy.naira_per_earned_unit IS NULL
     OR v_policy.usd_ngn_rate IS NULL THEN
    RAISE EXCEPTION 'Creator withdrawals are not yet enabled by SPIKE Owner';
  END IF;
  IF p_earned_units < v_policy.minimum_earned_units THEN
    RAISE EXCEPTION 'Minimum withdrawal is NGN 5,000';
  END IF;
  IF p_earned_units > v_policy.maximum_earned_units THEN
    RAISE EXCEPTION 'Maximum withdrawal request is NGN 10,000';
  END IF;

  v_local_now := now() AT TIME ZONE 'Africa/Lagos';
  v_local_time := v_local_now::time;
  IF extract(dow FROM v_local_now)::integer <> 0
     OR NOT ((v_local_time >= time '02:00' AND v_local_time < time '05:00')
          OR (v_local_time >= time '10:00' AND v_local_time < time '12:00')) THEN
    RAISE EXCEPTION 'Withdrawal requests open on Sundays from 2:00–5:00 AM and 10:00 AM–12:00 PM Nigeria time';
  END IF;

  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  IF coalesce(v_elig.status,'under_review') <> 'eligible' THEN RAISE EXCEPTION 'SPIKE earnings eligibility approval is required'; END IF;
  SELECT * INTO v_account FROM public.spike_creator_payout_accounts WHERE user_id=v_uid;
  IF NOT FOUND OR NOT v_account.verified THEN RAISE EXCEPTION 'A verified bank account is required'; END IF;

  INSERT INTO public.spike_creator_wallets(user_id) VALUES(v_uid) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid FOR UPDATE;
  IF v_wallet.earned_balance-v_wallet.reserved_balance < p_earned_units THEN RAISE EXCEPTION 'Insufficient available creator earnings'; END IF;

  v_amount_minor := round(p_earned_units * v_policy.naira_per_earned_unit * 100)::bigint;
  IF v_amount_minor < 500000 THEN RAISE EXCEPTION 'Minimum withdrawal is NGN 5,000'; END IF;
  IF v_amount_minor > 1000000 THEN RAISE EXCEPTION 'Maximum withdrawal request is NGN 10,000'; END IF;
  IF mod(v_amount_minor,100) <> 0 THEN RAISE EXCEPTION 'Withdrawal must resolve to a whole Naira amount'; END IF;
  v_usd_minor := round(v_amount_minor / v_policy.usd_ngn_rate)::bigint;
  v_ref := 'SPW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));

  UPDATE public.spike_creator_wallets
  SET reserved_balance=reserved_balance+p_earned_units,updated_at=now()
  WHERE user_id=v_uid;

  INSERT INTO public.spike_creator_withdrawals(
    user_id,reference,earned_units,gross_amount_minor,fee_amount_minor,net_amount_minor,currency,
    bank_name_snapshot,account_name_snapshot,account_number_snapshot,
    usd_amount_minor,usd_ngn_rate_snapshot,naira_per_earned_unit_snapshot
  ) VALUES (
    v_uid,v_ref,p_earned_units,v_amount_minor,0,v_amount_minor,'NGN',
    v_account.bank_name,v_account.account_name,v_account.account_number,
    v_usd_minor,v_policy.usd_ngn_rate,v_policy.naira_per_earned_unit
  ) RETURNING id INTO v_id;

  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_uid,'creator_withdrawal_submitted',jsonb_build_object(
    'reference',v_ref,'net_amount_minor',v_amount_minor,'usd_amount_minor',v_usd_minor,
    'currency','NGN','usd_currency','USD'
  ),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(v_uid,'creator_withdrawal_requested',v_uid,'user',jsonb_build_object(
    'withdrawal_id',v_id,'reference',v_ref,'earned_units',p_earned_units,
    'amount_minor',v_amount_minor,'usd_amount_minor',v_usd_minor,
    'usd_ngn_rate',v_policy.usd_ngn_rate,'withdrawal_timezone','Africa/Lagos'
  ));
  RETURN jsonb_build_object(
    'ok',true,'id',v_id,'reference',v_ref,'status','pending',
    'earned_units',p_earned_units,'gross_amount_minor',v_amount_minor,
    'fee_amount_minor',0,'net_amount_minor',v_amount_minor,
    'usd_amount_minor',v_usd_minor,'usd_ngn_rate',v_policy.usd_ngn_rate,'currency','NGN'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.spike_creator_request_withdrawal(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_request_withdrawal(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
