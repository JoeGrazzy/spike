BEGIN;

CREATE OR REPLACE FUNCTION public.spike_creator_cancel_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE v_uid uuid:=auth.uid(); v_withdrawal public.spike_creator_withdrawals; v_wallet public.spike_creator_wallets;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_withdrawal_id IS NULL THEN RAISE EXCEPTION 'Withdrawal reference is required'; END IF;
  SELECT * INTO v_withdrawal FROM public.spike_creator_withdrawals WHERE id=p_withdrawal_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your withdrawal request was not found'; END IF;
  IF v_withdrawal.status<>'pending' THEN RAISE EXCEPTION 'Only pending withdrawal requests can be cancelled'; END IF;
  SELECT * INTO v_wallet FROM public.spike_creator_wallets WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_balance<v_withdrawal.earned_units THEN RAISE EXCEPTION 'Reserved earnings mismatch; contact SPIKE support'; END IF;
  UPDATE public.spike_creator_wallets SET reserved_balance=reserved_balance-v_withdrawal.earned_units,updated_at=now() WHERE user_id=v_uid;
  UPDATE public.spike_creator_withdrawals SET status='cancelled',updated_at=now() WHERE id=v_withdrawal.id;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_uid,'creator_withdrawal_cancelled',jsonb_build_object('reference',v_withdrawal.reference,'earned_units_released',v_withdrawal.earned_units,'currency','NGN'),'normal');
  RETURN jsonb_build_object('ok',true,'reference',v_withdrawal.reference,'status','cancelled','released_earned_units',v_withdrawal.earned_units);
END; $$;
REVOKE ALL ON FUNCTION public.spike_creator_cancel_withdrawal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_cancel_withdrawal(uuid) TO authenticated;
COMMIT;
