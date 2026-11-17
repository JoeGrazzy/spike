-- Enforce SPIKE's NGN 5,000 minimum on already-net creator earnings.
-- Creator share is deducted when earnings are credited; withdrawals do not deduct it again.

CREATE OR REPLACE FUNCTION public.admin_creator_set_policy_v2(
  p_enabled boolean,
  p_minimum_withdrawal_naira bigint,
  p_maximum_withdrawal_naira bigint,
  p_naira_per_earned_coin numeric,
  p_usd_ngn_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_policy public.spike_creator_withdrawal_policy;
  v_unit_rate numeric(18,9);
  v_min_units bigint;
  v_max_units bigint;
BEGIN
  IF NOT private.spike_is_owner() THEN
    RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501';
  END IF;
  IF p_minimum_withdrawal_naira IS NULL OR p_minimum_withdrawal_naira < 5000
     OR p_maximum_withdrawal_naira IS NULL OR p_maximum_withdrawal_naira > 10000
     OR p_maximum_withdrawal_naira < p_minimum_withdrawal_naira
     OR p_naira_per_earned_coin IS NULL OR p_naira_per_earned_coin <= 0
     OR p_usd_ngn_rate IS NULL OR p_usd_ngn_rate <= 0 THEN
    RAISE EXCEPTION 'Policy must use a withdrawal range within NGN 5,000–10,000 and positive conversion rates';
  END IF;

  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true FOR UPDATE;
  v_unit_rate := p_naira_per_earned_coin / 1000.0;

  IF EXISTS (SELECT 1 FROM public.spike_creator_earnings_ledger)
     AND (v_policy.naira_per_earned_unit IS DISTINCT FROM v_unit_rate
          OR v_policy.usd_ngn_rate IS DISTINCT FROM p_usd_ngn_rate) THEN
    RAISE EXCEPTION 'The Earning Coin and USD conversion rates are locked after the first creator earning to protect existing balances';
  END IF;

  v_min_units := round(p_minimum_withdrawal_naira / v_unit_rate)::bigint;
  v_max_units := round(p_maximum_withdrawal_naira / v_unit_rate)::bigint;
  IF round(v_min_units * v_unit_rate, 2) <> p_minimum_withdrawal_naira
     OR round(v_max_units * v_unit_rate, 2) <> p_maximum_withdrawal_naira THEN
    RAISE EXCEPTION 'Withdrawal targets must align exactly with the Earning Coin conversion rate';
  END IF;

  UPDATE public.spike_creator_withdrawal_policy
  SET enabled = coalesce(p_enabled,false),
      minimum_earned_units = v_min_units,
      maximum_earned_units = v_max_units,
      naira_per_earned_unit = v_unit_rate,
      usd_ngn_rate = p_usd_ngn_rate,
      earned_units_per_coin = 1000,
      creator_earning_share_bps = 1000,
      fee_bps = 0,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE singleton=true;

  INSERT INTO public.admin_audit(actor_id,action,role,details)
  VALUES(auth.uid(),'creator_withdrawal_policy_v2_updated','owner',jsonb_build_object(
    'enabled',p_enabled,
    'minimum_withdrawal_naira',p_minimum_withdrawal_naira,
    'maximum_withdrawal_naira',p_maximum_withdrawal_naira,
    'naira_per_earned_coin',p_naira_per_earned_coin,
    'usd_ngn_rate',p_usd_ngn_rate,
    'creator_earning_share_bps',1000,
    'withdrawal_fee_bps',0,
    'timezone','Africa/Lagos',
    'windows',jsonb_build_array(jsonb_build_object('day','Sunday','start','02:00','end','05:00'),jsonb_build_object('day','Sunday','start','10:00','end','12:00'))
  ));
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled,'minimum_earned_units',v_min_units,'maximum_earned_units',v_max_units);
END;
$function$;

-- Keep the legacy owner policy RPC from configuring an enabled policy below NGN 5,000.
CREATE OR REPLACE FUNCTION public.admin_creator_set_policy(
  p_enabled boolean,
  p_minimum_earned_units bigint,
  p_naira_per_earned_unit numeric,
  p_fee_bps integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_minimum_naira numeric;
BEGIN
  IF NOT private.spike_is_owner() THEN
    RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501';
  END IF;
  v_minimum_naira := p_minimum_earned_units * p_naira_per_earned_unit;
  IF p_enabled AND (
      p_minimum_earned_units IS NULL OR p_minimum_earned_units <= 0
      OR p_naira_per_earned_unit IS NULL OR p_naira_per_earned_unit <= 0
      OR v_minimum_naira < 5000
      OR p_fee_bps IS NULL OR p_fee_bps NOT BETWEEN 0 AND 10000
  ) THEN
    RAISE EXCEPTION 'Enabled withdrawals require a minimum net payout of at least NGN 5,000 and valid conversion settings';
  END IF;
  UPDATE public.spike_creator_withdrawal_policy
  SET enabled=coalesce(p_enabled,false),
      minimum_earned_units=p_minimum_earned_units,
      naira_per_earned_unit=p_naira_per_earned_unit,
      fee_bps=p_fee_bps,
      updated_by=auth.uid(),
      updated_at=now()
  WHERE singleton=true;
  INSERT INTO public.admin_audit(actor_id,action,role,details)
  VALUES(auth.uid(),'creator_withdrawal_policy_updated','owner',jsonb_build_object(
    'enabled',p_enabled,
    'minimum_earned_units',p_minimum_earned_units,
    'naira_per_earned_unit',p_naira_per_earned_unit,
    'fee_bps',p_fee_bps
  ));
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled);
END;
$function$;

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

UPDATE public.spike_creator_withdrawal_policy
SET minimum_earned_units = GREATEST(
      minimum_earned_units,
      round(5000 / naira_per_earned_unit)::bigint
    ),
    updated_at = now()
WHERE singleton=true
  AND naira_per_earned_unit IS NOT NULL
  AND naira_per_earned_unit > 0;
