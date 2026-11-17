-- Preserve full creator earnings conversion precision in the wallet summary.
-- This does not change earned units, fees, payout thresholds, or withdrawal rules.
CREATE OR REPLACE FUNCTION public.spike_creator_wallet_summary_internal()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode='28000';
  END IF;

  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  SELECT * INTO v_elig FROM public.spike_creator_eligibility WHERE user_id=v_uid;
  SELECT * INTO v_account FROM public.spike_creator_payout_accounts WHERE user_id=v_uid;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  SELECT * INTO v_sub
  FROM private.spike_verified_subscriptions
  WHERE user_id=v_uid AND status='active' AND expires_at>now()
  ORDER BY expires_at DESC LIMIT 1;

  v_restricted := private.spike_user_is_restricted(v_uid);
  v_creator := private.spike_user_has_active_verified_subscription(v_uid);
  v_available := coalesce(v_wallet.earned_balance,0)-coalesce(v_wallet.reserved_balance,0);

  -- Preserve full precision so even the smallest qualifying earning is visible.
  -- Withdrawal thresholds still use the integer earned-unit balance.
  v_ngn := v_available * coalesce(v_policy.naira_per_earned_unit,0);
  v_usd := CASE
    WHEN coalesce(v_policy.usd_ngn_rate,0)>0 THEN v_ngn/v_policy.usd_ngn_rate
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'earned_balance',coalesce(v_wallet.earned_balance,0),
    'reserved_balance',coalesce(v_wallet.reserved_balance,0),
    'available_balance',v_available,
    'earned_units_per_coin',coalesce(v_policy.earned_units_per_coin,1000),
    'available_earning_coins',round(v_available::numeric/coalesce(v_policy.earned_units_per_coin,1000),3),
    'available_earnings_naira',v_ngn,
    'available_earnings_usd',v_usd,
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

NOTIFY pgrst, 'reload schema';
