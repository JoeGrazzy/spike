CREATE OR REPLACE FUNCTION public.spike_wallet_coin_source_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE v_wallet public.wallets; v_source public.spike_coin_source_balances;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=auth.uid();
  SELECT * INTO v_source FROM public.spike_coin_source_balances WHERE user_id=auth.uid();
  IF coalesce(v_wallet.balance,0)<>coalesce(v_source.paid_balance,0)+coalesce(v_source.bonus_balance,0) THEN
    RAISE EXCEPTION 'SP COIN source balance is being reconciled; please refresh shortly';
  END IF;
  RETURN jsonb_build_object(
    'total_coins',coalesce(v_wallet.balance,0),
    'paid_coins',coalesce(v_source.paid_balance,0),
    'bonus_coins',coalesce(v_source.bonus_balance,0)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_wallet_coin_source_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_wallet_coin_source_summary() TO authenticated;
