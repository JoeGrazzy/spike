BEGIN;

-- Creator earnings are stored in milli-Earning-Coins (1,000 units = 1 Earning Coin).
-- At the SPIKE coin price, 1 Earning Coin = NGN 2.00, so one stored unit = NGN 0.002.
ALTER TABLE public.spike_creator_withdrawal_policy
  ADD COLUMN IF NOT EXISTS maximum_earned_units bigint,
  ADD COLUMN IF NOT EXISTS usd_ngn_rate numeric(18,6),
  ADD COLUMN IF NOT EXISTS earned_units_per_coin integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS creator_earning_share_bps integer NOT NULL DEFAULT 1000;

ALTER TABLE public.spike_creator_earnings_ledger
  ADD COLUMN IF NOT EXISTS gross_amount_units bigint,
  ADD COLUMN IF NOT EXISTS platform_share_units bigint,
  ADD COLUMN IF NOT EXISTS usd_ngn_rate_snapshot numeric(18,6),
  ADD COLUMN IF NOT EXISTS naira_per_earned_unit_snapshot numeric(18,9);

ALTER TABLE public.spike_creator_withdrawals
  ADD COLUMN IF NOT EXISTS usd_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS usd_ngn_rate_snapshot numeric(18,6),
  ADD COLUMN IF NOT EXISTS naira_per_earned_unit_snapshot numeric(18,9),
  ADD COLUMN IF NOT EXISTS deduction_ledger_id uuid,
  ADD COLUMN IF NOT EXISTS refund_ledger_id uuid;

-- Extend accounting vocabularies for the new, auditable earning-share and refund entries.
ALTER TABLE public.spike_creator_earnings_ledger
  DROP CONSTRAINT IF EXISTS spike_creator_earnings_ledger_source_type_check;
ALTER TABLE public.spike_creator_earnings_ledger
  ADD CONSTRAINT spike_creator_earnings_ledger_source_type_check
  CHECK (source_type = ANY (ARRAY['creator_reward','gift_share','room_share','campaign','adjustment','withdrawal','withdrawal_refund','withdrawal_retry']::text[]));
ALTER TABLE public.spike_revenue
  DROP CONSTRAINT IF EXISTS spike_revenue_source_check;
ALTER TABLE public.spike_revenue
  ADD CONSTRAINT spike_revenue_source_check
  CHECK (source = ANY (ARRAY['coin_purchase','gift_fee','withdrawal_fee','streak_revival','creator_earning_share']::text[]));
ALTER TABLE public.spike_creator_withdrawal_policy
  ADD CONSTRAINT spike_creator_withdrawal_policy_maximum_earned_units_check
  CHECK (maximum_earned_units IS NULL OR maximum_earned_units > 0),
  ADD CONSTRAINT spike_creator_withdrawal_policy_earning_scale_check
  CHECK (earned_units_per_coin > 0),
  ADD CONSTRAINT spike_creator_withdrawal_policy_creator_share_check
  CHECK (creator_earning_share_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT spike_creator_withdrawal_policy_usd_rate_check
  CHECK (usd_ngn_rate IS NULL OR usd_ngn_rate > 0);

UPDATE public.spike_creator_withdrawal_policy
SET enabled = false,
    minimum_earned_units = 500000,       -- NGN 1,000 net
    maximum_earned_units = 5000000,      -- NGN 10,000 per request
    naira_per_earned_unit = 0.002,       -- milli-coin unit; NGN 2 per Earning Coin
    usd_ngn_rate = 1345.640000,          -- initial Owner-controlled internal conversion reference
    earned_units_per_coin = 1000,
    creator_earning_share_bps = 1000,     -- 10% withheld before net earnings are credited
    fee_bps = 0,                         -- no second fee at withdrawal
    updated_at = now()
WHERE singleton = true;

-- Internal idempotent earning-credit primitive. The public/admin entry point and future
-- server-side gift settlement must use this same function so the 10% is never charged twice.
CREATE OR REPLACE FUNCTION private.spike_credit_creator_earning(
  p_user_id uuid,
  p_gross_units bigint,
  p_source_type text,
  p_source_reference text,
  p_description text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_policy public.spike_creator_withdrawal_policy;
  v_wallet public.spike_creator_wallets;
  v_before bigint;
  v_after bigint;
  v_fee_units bigint := 0;
  v_net_units bigint;
  v_revenue_minor bigint := 0;
  v_ledger_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_gross_units IS NULL OR p_gross_units = 0
     OR abs(p_gross_units) > 1000000000
     OR p_source_type NOT IN ('creator_reward','gift_share','room_share','campaign','adjustment')
     OR (p_gross_units < 0 AND p_source_type <> 'adjustment')
     OR nullif(trim(coalesce(p_source_reference,'')),'') IS NULL
     OR nullif(trim(coalesce(p_description,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid creator earning entry';
  END IF;

  SELECT * INTO v_policy
  FROM public.spike_creator_withdrawal_policy
  WHERE singleton = true;
  IF NOT FOUND OR v_policy.naira_per_earned_unit IS NULL THEN
    RAISE EXCEPTION 'Creator earning conversion policy is not configured';
  END IF;

  IF p_gross_units > 0 AND p_source_type <> 'adjustment' THEN
    v_fee_units := round(p_gross_units * v_policy.creator_earning_share_bps / 10000.0)::bigint;
  END IF;
  v_net_units := p_gross_units - v_fee_units;
  IF v_net_units = 0 THEN RAISE EXCEPTION 'Net creator earning must be positive'; END IF;

  INSERT INTO public.spike_creator_wallets(user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.spike_creator_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_before := v_wallet.earned_balance;
  v_after := v_before + v_net_units;
  IF v_after < 0 OR v_after < v_wallet.reserved_balance THEN
    RAISE EXCEPTION 'Creator adjustment would overdraw or consume reserved earnings';
  END IF;

  INSERT INTO public.spike_creator_earnings_ledger(
    user_id, amount_units, balance_before, balance_after,
    source_type, source_reference, description, created_by,
    gross_amount_units, platform_share_units,
    usd_ngn_rate_snapshot, naira_per_earned_unit_snapshot
  ) VALUES (
    p_user_id, v_net_units, v_before, v_after,
    p_source_type, trim(p_source_reference), trim(p_description), p_actor_id,
    CASE WHEN p_gross_units > 0 THEN p_gross_units ELSE NULL END,
    CASE WHEN v_fee_units > 0 THEN v_fee_units ELSE 0 END,
    v_policy.usd_ngn_rate, v_policy.naira_per_earned_unit
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.spike_creator_wallets
  SET earned_balance = v_after, updated_at = now()
  WHERE user_id = p_user_id;

  IF v_fee_units > 0 THEN
    v_revenue_minor := round(v_fee_units * v_policy.naira_per_earned_unit * 100)::bigint;
    IF v_revenue_minor > 0 THEN
      INSERT INTO public.spike_revenue(user_id, source, amount_minor, metadata)
      VALUES (
        p_user_id,
        'creator_earning_share',
        v_revenue_minor,
        jsonb_build_object(
          'currency','NGN',
          'gross_earning_units',p_gross_units,
          'platform_share_units',v_fee_units,
          'creator_net_units',v_net_units,
          'share_bps',v_policy.creator_earning_share_bps,
          'source_type',p_source_type,
          'source_reference',trim(p_source_reference),
          'earning_ledger_id',v_ledger_id
        )
      );
    END IF;
  END IF;

  INSERT INTO public.admin_audit(actor_id, action, target_user_id, role, details)
  VALUES (
    p_actor_id,
    'creator_earning_credited',
    p_user_id,
    CASE WHEN p_actor_id IS NULL THEN 'system' ELSE 'owner' END,
    jsonb_build_object(
      'source_type',p_source_type,
      'source_reference',trim(p_source_reference),
      'gross_units',p_gross_units,
      'platform_share_units',v_fee_units,
      'net_units',v_net_units,
      'earning_ledger_id',v_ledger_id
    )
  );

  RETURN jsonb_build_object(
    'ok',true,
    'ledger_id',v_ledger_id,
    'gross_units',p_gross_units,
    'platform_share_units',v_fee_units,
    'net_units',v_net_units,
    'balance_units',v_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.spike_credit_creator_earning(uuid,bigint,text,text,text,uuid) FROM PUBLIC, anon, authenticated;

-- Owner manual earning posts accept decimal Earning Coins and apply the 10% share once.
CREATE OR REPLACE FUNCTION public.admin_creator_post_earning_v2(
  p_user_id uuid,
  p_gross_earning_coins numeric,
  p_source_type text,
  p_source_reference text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_units bigint;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_gross_earning_coins IS NULL OR p_gross_earning_coins = 0
     OR abs(p_gross_earning_coins) > 1000000
     OR round(p_gross_earning_coins * 1000,0) <> p_gross_earning_coins * 1000
     OR p_source_type NOT IN ('creator_reward','gift_share','room_share','campaign','adjustment')
     OR (p_gross_earning_coins < 0 AND p_source_type <> 'adjustment') THEN
    RAISE EXCEPTION 'Enter a valid Earning Coin amount (up to 3 decimal places) and source';
  END IF;
  v_units := round(p_gross_earning_coins * 1000)::bigint;
  RETURN private.spike_credit_creator_earning(
    p_user_id,v_units,p_source_type,p_source_reference,p_description,auth.uid()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_creator_post_earning_v2(uuid,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_post_earning_v2(uuid,numeric,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_creator_post_earning(uuid,bigint,text,text,text) FROM PUBLIC, anon, authenticated;

-- The old policy setter exposed a withdrawal-time fee. Retire it so the old model cannot be restored.
REVOKE ALL ON FUNCTION public.admin_creator_set_policy(boolean,bigint,numeric,integer) FROM PUBLIC, anon, authenticated;

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
  IF p_minimum_withdrawal_naira IS NULL OR p_minimum_withdrawal_naira < 1000
     OR p_maximum_withdrawal_naira IS NULL OR p_maximum_withdrawal_naira > 10000
     OR p_maximum_withdrawal_naira < p_minimum_withdrawal_naira
     OR p_naira_per_earned_coin IS NULL OR p_naira_per_earned_coin <= 0
     OR p_usd_ngn_rate IS NULL OR p_usd_ngn_rate <= 0 THEN
    RAISE EXCEPTION 'Policy must use a withdrawal range within NGN 1,000–10,000 and positive conversion rates';
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
REVOKE ALL ON FUNCTION public.admin_creator_set_policy_v2(boolean,bigint,bigint,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_set_policy_v2(boolean,bigint,bigint,numeric,numeric) TO authenticated;

-- USD display and progress-bar values are returned from the server's locked conversion policy.
CREATE OR REPLACE FUNCTION public.spike_creator_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wallet public.spike_creator_wallets;
  v_policy public.spike_creator_withdrawal_policy;
  v_elig public.spike_creator_eligibility;
  v_account public.spike_creator_payout_accounts;
  v_profile public.profiles;
  v_sub private.spike_verified_subscriptions;
  v_available bigint;
  v_ngn numeric;
  v_usd numeric;
  v_creator boolean := false;
  v_restricted boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  SELECT * INTO v_account FROM public.spike_creator_payout_accounts WHERE user_id=v_uid;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions
    WHERE user_id=v_uid AND status='active' AND expires_at>now()
    ORDER BY expires_at DESC LIMIT 1;
  v_restricted := private.spike_user_is_restricted(v_uid);
  v_creator := private.spike_user_has_active_verified_subscription(v_uid);
  v_available := coalesce(v_wallet.earned_balance,0)-coalesce(v_wallet.reserved_balance,0);
  v_ngn := v_available * coalesce(v_policy.naira_per_earned_unit,0);
  v_usd := CASE WHEN coalesce(v_policy.usd_ngn_rate,0)>0 THEN v_ngn/v_policy.usd_ngn_rate ELSE 0 END;
  RETURN jsonb_build_object(
    'earned_balance',coalesce(v_wallet.earned_balance,0),
    'reserved_balance',coalesce(v_wallet.reserved_balance,0),
    'available_balance',v_available,
    'earned_units_per_coin',coalesce(v_policy.earned_units_per_coin,1000),
    'available_earning_coins',round(v_available::numeric/coalesce(v_policy.earned_units_per_coin,1000),3),
    'available_earnings_naira',round(v_ngn,2),
    'available_earnings_usd',round(v_usd,2),
    'withdrawal_enabled',coalesce(v_policy.enabled,false),
    'minimum_earned_units',v_policy.minimum_earned_units,
    'maximum_earned_units',v_policy.maximum_earned_units,
    'minimum_withdrawal_naira',round(coalesce(v_policy.minimum_earned_units,0)*coalesce(v_policy.naira_per_earned_unit,0),2),
    'maximum_withdrawal_naira',round(coalesce(v_policy.maximum_earned_units,0)*coalesce(v_policy.naira_per_earned_unit,0),2),
    'naira_per_earned_unit',v_policy.naira_per_earned_unit,
    'naira_per_earned_coin',v_policy.naira_per_earned_unit*coalesce(v_policy.earned_units_per_coin,1000),
    'usd_ngn_rate',v_policy.usd_ngn_rate,
    'creator_earning_share_bps',coalesce(v_policy.creator_earning_share_bps,1000),
    'fee_bps',0,
    'withdrawal_timezone','Africa/Lagos',
    'withdrawal_windows',jsonb_build_array(
      jsonb_build_object('day','Sunday','start','02:00','end','05:00'),
      jsonb_build_object('day','Sunday','start','10:00','end','12:00')
    ),
    'eligibility_status',coalesce(v_elig.status,'under_review'),
    'eligibility_requested',v_elig.user_id IS NOT NULL,
    'eligibility_reason',v_elig.reason,
    'payout_account_verified',coalesce(v_account.verified,false),
    'payout_bank_name',v_account.bank_name,
    'has_valid_sp_id',nullif(trim(coalesce(v_profile.sp_id,'')),'') IS NOT NULL,
    'account_restricted',v_restricted,
    'is_creator',v_creator,
    'creator_status',CASE WHEN v_creator THEN 'active' ELSE 'inactive' END,
    'creator_status_source','active_paid_verified_subscription'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_creator_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_wallet_summary() TO authenticated;

-- Withdrawal requests reserve the creator's already-net earnings. No second 10% fee is charged.
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
  IF p_earned_units < v_policy.minimum_earned_units THEN RAISE EXCEPTION 'Minimum withdrawal is NGN 1,000'; END IF;
  IF p_earned_units > v_policy.maximum_earned_units THEN RAISE EXCEPTION 'Maximum withdrawal request is NGN 10,000'; END IF;

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
  IF v_amount_minor <= 0 OR mod(v_amount_minor,100) <> 0 THEN RAISE EXCEPTION 'Withdrawal must resolve to a whole Naira amount'; END IF;
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

-- Owner approval is the debit point. Payment confirmation does not debit a second time.
CREATE OR REPLACE FUNCTION public.admin_creator_decide_withdrawal(
  p_withdrawal_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  w public.spike_creator_withdrawals;
  v_wallet public.spike_creator_wallets;
  v_after bigint;
  v_ledger_id uuid;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Decision must be approve or reject'; END IF;
  SELECT * INTO w FROM public.spike_creator_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.status <> 'pending' THEN RAISE EXCEPTION 'Pending withdrawal not found'; END IF;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=w.user_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_balance < w.earned_units THEN RAISE EXCEPTION 'Reserved creator balance mismatch; reconcile before approval'; END IF;

  IF p_decision='approve' THEN
    IF v_wallet.earned_balance < w.earned_units THEN RAISE EXCEPTION 'Creator balance mismatch; reconcile before approval'; END IF;
    v_after := v_wallet.earned_balance - w.earned_units;
    UPDATE public.spike_creator_wallets
    SET earned_balance=v_after,reserved_balance=reserved_balance-w.earned_units,updated_at=now()
    WHERE user_id=w.user_id;
    INSERT INTO public.spike_creator_earnings_ledger(
      user_id,amount_units,balance_before,balance_after,source_type,source_reference,description,created_by
    ) VALUES (
      w.user_id,-w.earned_units,v_wallet.earned_balance,v_after,'withdrawal',w.reference,
      'Creator withdrawal approved and deducted from available earnings',auth.uid()
    ) RETURNING id INTO v_ledger_id;
    UPDATE public.spike_creator_withdrawals
    SET status='approved',owner_note=nullif(left(trim(coalesce(p_note,'')),1000),''),
        decided_by=auth.uid(),decided_at=now(),deduction_ledger_id=v_ledger_id,
        refund_ledger_id=NULL,updated_at=now()
    WHERE id=w.id;
  ELSE
    UPDATE public.spike_creator_wallets
    SET reserved_balance=reserved_balance-w.earned_units,updated_at=now()
    WHERE user_id=w.user_id;
    UPDATE public.spike_creator_withdrawals
    SET status='rejected',owner_note=nullif(left(trim(coalesce(p_note,'')),1000),''),
        decided_by=auth.uid(),decided_at=now(),updated_at=now()
    WHERE id=w.id;
  END IF;

  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'creator_withdrawal_'||p_decision,w.user_id,'owner',jsonb_build_object(
    'reference',w.reference,'earned_units',w.earned_units,'note',p_note,
    'deducted_on_approval',p_decision='approve','deduction_ledger_id',v_ledger_id
  ));
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(w.user_id,'creator_withdrawal_'||CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
    jsonb_build_object('reference',w.reference,'note',p_note,'amount_minor',w.net_amount_minor,'currency','NGN'),'normal');
  RETURN jsonb_build_object('ok',true,'reference',w.reference,'status',CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,'deducted',p_decision='approve');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_creator_mark_withdrawal_paid(
  p_withdrawal_id uuid,
  p_bank_transfer_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE w public.spike_creator_withdrawals;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF nullif(trim(p_bank_transfer_reference),'') IS NULL THEN RAISE EXCEPTION 'Bank transfer reference is required'; END IF;
  SELECT * INTO w FROM public.spike_creator_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.status<>'approved' THEN RAISE EXCEPTION 'Approved withdrawal not found'; END IF;
  IF w.deduction_ledger_id IS NULL THEN RAISE EXCEPTION 'Withdrawal deduction is missing; reconcile before marking paid'; END IF;
  UPDATE public.spike_creator_withdrawals
  SET status='paid',bank_transfer_reference=trim(p_bank_transfer_reference),paid_at=now(),updated_at=now()
  WHERE id=w.id;
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'creator_withdrawal_paid',w.user_id,'owner',jsonb_build_object(
    'reference',w.reference,'bank_transfer_reference',p_bank_transfer_reference,
    'net_amount_minor',w.net_amount_minor,'usd_amount_minor',w.usd_amount_minor,
    'balance_deducted_at_approval',true
  ));
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(w.user_id,'creator_withdrawal_paid',jsonb_build_object(
    'reference',w.reference,'net_amount_minor',w.net_amount_minor,
    'usd_amount_minor',w.usd_amount_minor,'currency','NGN','usd_currency','USD'
  ),'high');
  RETURN jsonb_build_object('ok',true,'reference',w.reference,'status','paid','deducted_at_approval',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_creator_mark_withdrawal_failed(
  p_withdrawal_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  w public.spike_creator_withdrawals;
  v_wallet public.spike_creator_wallets;
  v_after bigint;
  v_ledger_id uuid;
  v_ref text;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF nullif(trim(coalesce(p_note,'')),'') IS NULL THEN RAISE EXCEPTION 'Failure note is required'; END IF;
  SELECT * INTO w FROM public.spike_creator_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.status<>'approved' THEN RAISE EXCEPTION 'Approved withdrawal not found'; END IF;
  IF w.deduction_ledger_id IS NULL THEN RAISE EXCEPTION 'Withdrawal deduction is missing; reconcile before refund'; END IF;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=w.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Creator wallet not found; reconcile manually'; END IF;
  v_after := v_wallet.earned_balance + w.earned_units;
  UPDATE public.spike_creator_wallets SET earned_balance=v_after,updated_at=now() WHERE user_id=w.user_id;
  v_ref := w.reference||':refund:'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.spike_creator_earnings_ledger(
    user_id,amount_units,balance_before,balance_after,source_type,source_reference,description,created_by
  ) VALUES (
    w.user_id,w.earned_units,v_wallet.earned_balance,v_after,'withdrawal_refund',v_ref,
    'Creator withdrawal failed; approved deduction returned to earnings',auth.uid()
  ) RETURNING id INTO v_ledger_id;
  UPDATE public.spike_creator_withdrawals
  SET status='failed',owner_note=left(trim(p_note),1000),refund_ledger_id=v_ledger_id,
      updated_at=now()
  WHERE id=w.id;
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'creator_withdrawal_failed',w.user_id,'owner',jsonb_build_object(
    'reference',w.reference,'note',p_note,'refunded_earned_units',w.earned_units,
    'refund_ledger_id',v_ledger_id
  ));
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(w.user_id,'creator_withdrawal_failed',jsonb_build_object(
    'reference',w.reference,'note',p_note,'earnings_restored',true
  ),'high');
  RETURN jsonb_build_object('ok',true,'reference',w.reference,'status','failed','earnings_restored',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_creator_reconcile_withdrawal(
  p_withdrawal_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  w public.spike_creator_withdrawals;
  v_wallet public.spike_creator_wallets;
  v_after bigint;
  v_ledger_id uuid;
  v_ref text;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_action NOT IN ('retry','cancel') THEN RAISE EXCEPTION 'Action must be retry or cancel'; END IF;
  SELECT * INTO w FROM public.spike_creator_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.status<>'failed' THEN RAISE EXCEPTION 'Failed withdrawal not found'; END IF;

  IF p_action='retry' THEN
    SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=w.user_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.earned_balance-v_wallet.reserved_balance < w.earned_units THEN
      RAISE EXCEPTION 'Creator no longer has enough available earnings to retry this payout';
    END IF;
    v_after := v_wallet.earned_balance - w.earned_units;
    UPDATE public.spike_creator_wallets SET earned_balance=v_after,updated_at=now() WHERE user_id=w.user_id;
    v_ref := w.reference||':retry:'||replace(gen_random_uuid()::text,'-','');
    INSERT INTO public.spike_creator_earnings_ledger(
      user_id,amount_units,balance_before,balance_after,source_type,source_reference,description,created_by
    ) VALUES (
      w.user_id,-w.earned_units,v_wallet.earned_balance,v_after,'withdrawal_retry',v_ref,
      'Creator withdrawal retry approved and deducted from earnings',auth.uid()
    ) RETURNING id INTO v_ledger_id;
    UPDATE public.spike_creator_withdrawals
    SET status='approved',owner_note=nullif(left(trim(coalesce(p_note,'')),1000),''),
        decided_by=auth.uid(),decided_at=now(),deduction_ledger_id=v_ledger_id,refund_ledger_id=NULL,updated_at=now()
    WHERE id=w.id;
  ELSE
    UPDATE public.spike_creator_withdrawals
    SET status='rejected',owner_note=nullif(left(trim(coalesce(p_note,'')),1000),''),
        decided_by=auth.uid(),decided_at=now(),updated_at=now()
    WHERE id=w.id;
  END IF;

  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'creator_withdrawal_reconciled',w.user_id,'owner',jsonb_build_object(
    'reference',w.reference,'action',p_action,'note',p_note,'deduction_ledger_id',v_ledger_id
  ));
  RETURN jsonb_build_object('ok',true,'reference',w.reference,'status',CASE WHEN p_action='retry' THEN 'approved' ELSE 'rejected' END);
END;
$function$;

COMMIT;
