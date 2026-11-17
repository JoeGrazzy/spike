BEGIN;

-- Keep purchased and promotional SP COINS distinguishable without replacing the existing wallet.
CREATE TABLE IF NOT EXISTS public.spike_coin_source_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  paid_balance bigint NOT NULL DEFAULT 0 CHECK (paid_balance>=0),
  bonus_balance bigint NOT NULL DEFAULT 0 CHECK (bonus_balance>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spike_coin_source_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spike_coin_source_balances FROM PUBLIC,anon,authenticated;

ALTER TABLE public.coin_ledger
  ADD COLUMN IF NOT EXISTS paid_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_amount bigint NOT NULL DEFAULT 0;

-- Conservative chronological backfill: historical spend consumes paid coins first.
-- This avoids turning any previously granted promotional balance into cashable creator earnings.
DO $backfill$
DECLARE
  v_wallet record;
  v_entry record;
  v_order record;
  v_paid bigint;
  v_bonus bigint;
  v_paid_credit bigint;
  v_bonus_credit bigint;
  v_spend bigint;
  v_paid_spent bigint;
  v_bonus_spent bigint;
  v_delta bigint;
  v_take bigint;
BEGIN
  FOR v_wallet IN SELECT user_id,balance FROM public.wallets ORDER BY user_id LOOP
    v_paid:=0; v_bonus:=0;
    FOR v_entry IN
      SELECT id,amount,transaction_type,reference_id
      FROM public.coin_ledger
      WHERE user_id=v_wallet.user_id
      ORDER BY created_at,id
    LOOP
      v_paid_credit:=0; v_bonus_credit:=0; v_paid_spent:=0; v_bonus_spent:=0;
      IF v_entry.amount>0 THEN
        IF v_entry.transaction_type='purchase' THEN
          SELECT coins,bonus_coins INTO v_order
          FROM public.coin_orders
          WHERE id::text=v_entry.reference_id AND status='approved'
          LIMIT 1;
          IF FOUND THEN
            v_paid_credit:=v_order.coins;
            v_bonus_credit:=v_order.bonus_coins;
          ELSE
            v_paid_credit:=v_entry.amount;
          END IF;
        ELSE
          v_bonus_credit:=v_entry.amount;
        END IF;
        v_paid:=v_paid+v_paid_credit;
        v_bonus:=v_bonus+v_bonus_credit;
      ELSIF v_entry.amount<0 THEN
        v_spend:=abs(v_entry.amount);
        v_paid_spent:=least(v_paid,v_spend);
        v_bonus_spent:=v_spend-v_paid_spent;
        IF v_bonus_spent>v_bonus THEN
          RAISE EXCEPTION 'Historical SP COIN ledger exceeds recorded credits for user %',v_wallet.user_id;
        END IF;
        v_paid:=v_paid-v_paid_spent;
        v_bonus:=v_bonus-v_bonus_spent;
      END IF;
      UPDATE public.coin_ledger
      SET paid_amount=v_paid_credit+v_paid_spent,
          bonus_amount=v_bonus_credit+v_bonus_spent
      WHERE id=v_entry.id;
    END LOOP;
    v_delta:=v_wallet.balance-(v_paid+v_bonus);
    IF v_delta>0 THEN
      v_bonus:=v_bonus+v_delta;
    ELSIF v_delta<0 THEN
      v_delta:=abs(v_delta);
      v_take:=least(v_bonus,v_delta);
      v_bonus:=v_bonus-v_take;
      v_delta:=v_delta-v_take;
      IF v_delta>v_paid THEN
        RAISE EXCEPTION 'Unable to reconcile historical SP COIN balance for user %',v_wallet.user_id;
      END IF;
      v_paid:=v_paid-v_delta;
    END IF;
    INSERT INTO public.spike_coin_source_balances(user_id,paid_balance,bonus_balance)
    VALUES(v_wallet.user_id,v_paid,v_bonus)
    ON CONFLICT(user_id) DO UPDATE SET paid_balance=excluded.paid_balance,
      bonus_balance=excluded.bonus_balance,updated_at=now();
  END LOOP;
END;
$backfill$;

ALTER TABLE public.coin_ledger
  ADD CONSTRAINT coin_ledger_source_amounts_nonnegative CHECK (paid_amount>=0 AND bonus_amount>=0),
  ADD CONSTRAINT coin_ledger_source_amounts_match CHECK (paid_amount+bonus_amount=abs(amount));

CREATE OR REPLACE FUNCTION private.spike_apply_coin_delta_with_sources(
  p_user_id uuid,
  p_amount bigint,
  p_transaction_type text,
  p_reference_id text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','auth'
AS $function$
DECLARE
  v_wallet public.wallets;
  v_source public.spike_coin_source_balances;
  v_existing public.coin_ledger;
  v_before bigint;
  v_after bigint;
  v_paid_spent bigint:=0;
  v_bonus_spent bigint:=0;
  v_paid_amount bigint:=0;
  v_bonus_amount bigint:=0;
  v_paid_after bigint;
  v_bonus_after bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_user_id<>auth.uid() AND NOT public.admin_guard() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_amount IS NULL OR p_amount=0 THEN RAISE EXCEPTION 'amount cannot be zero'; END IF;
  IF p_transaction_type NOT IN ('purchase','admin_adjustment','refund','reward','spend','correction') THEN
    RAISE EXCEPTION 'invalid transaction type';
  END IF;

  IF p_reference_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.coin_ledger
    WHERE transaction_type=p_transaction_type AND reference_id=p_reference_id LIMIT 1;
    IF FOUND THEN
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id=p_user_id;
      SELECT * INTO v_source FROM public.spike_coin_source_balances WHERE user_id=p_user_id;
      RETURN jsonb_build_object(
        'already_processed',true,'wallet_balance_after',coalesce(v_wallet.balance,0),
        'paid_balance_after',coalesce(v_source.paid_balance,0),
        'bonus_balance_after',coalesce(v_source.bonus_balance,0),
        'paid_spent',CASE WHEN v_existing.amount<0 THEN v_existing.paid_amount ELSE 0 END,
        'bonus_spent',CASE WHEN v_existing.amount<0 THEN v_existing.bonus_amount ELSE 0 END
      );
    END IF;
  END IF;

  INSERT INTO public.wallets(user_id,balance) VALUES(p_user_id,0)
  ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.spike_coin_source_balances(user_id,paid_balance,bonus_balance)
  VALUES(p_user_id,0,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO v_source FROM public.spike_coin_source_balances WHERE user_id=p_user_id FOR UPDATE;
  IF v_wallet.balance<>v_source.paid_balance+v_source.bonus_balance THEN
    RAISE EXCEPTION 'SP COIN source balances require reconciliation';
  END IF;
  v_before:=v_wallet.balance;
  v_paid_after:=v_source.paid_balance;
  v_bonus_after:=v_source.bonus_balance;

  IF p_amount>0 THEN
    IF p_transaction_type='purchase' THEN
      v_paid_amount:=p_amount;
      v_paid_after:=v_paid_after+p_amount;
    ELSE
      v_bonus_amount:=p_amount;
      v_bonus_after:=v_bonus_after+p_amount;
    END IF;
  ELSE
    v_bonus_spent:=least(v_bonus_after,abs(p_amount));
    v_paid_spent:=abs(p_amount)-v_bonus_spent;
    IF v_paid_spent>v_paid_after THEN RAISE EXCEPTION 'insufficient balance'; END IF;
    v_bonus_after:=v_bonus_after-v_bonus_spent;
    v_paid_after:=v_paid_after-v_paid_spent;
    v_paid_amount:=v_paid_spent;
    v_bonus_amount:=v_bonus_spent;
  END IF;

  v_after:=v_paid_after+v_bonus_after;
  IF v_after<>v_before+p_amount THEN RAISE EXCEPTION 'SP COIN source balance calculation failed'; END IF;
  UPDATE public.wallets SET balance=v_after,updated_at=now() WHERE user_id=p_user_id RETURNING * INTO v_wallet;
  UPDATE public.spike_coin_source_balances SET paid_balance=v_paid_after,bonus_balance=v_bonus_after,updated_at=now()
  WHERE user_id=p_user_id;
  INSERT INTO public.coin_ledger(
    user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason,paid_amount,bonus_amount
  ) VALUES(p_user_id,p_amount,v_before,v_after,p_transaction_type,p_reference_id,p_reason,v_paid_amount,v_bonus_amount);
  RETURN jsonb_build_object(
    'already_processed',false,'wallet_balance_after',v_after,
    'paid_balance_after',v_paid_after,'bonus_balance_after',v_bonus_after,
    'paid_spent',v_paid_spent,'bonus_spent',v_bonus_spent
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.spike_apply_coin_delta_with_sources(uuid,bigint,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.apply_coin_delta(
  p_user_id uuid,p_amount bigint,p_transaction_type text,p_reference_id text DEFAULT NULL,p_reason text DEFAULT NULL
)
RETURNS public.wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','auth'
AS $function$
DECLARE v_result jsonb; v_wallet public.wallets;
BEGIN
  v_result:=private.spike_apply_coin_delta_with_sources(p_user_id,p_amount,p_transaction_type,p_reference_id,p_reason);
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=p_user_id;
  RETURN v_wallet;
END;
$function$;

-- Coin order approval credits the paid and promotional portions into separate source balances.
CREATE OR REPLACE FUNCTION public.admin_decide_coin_order(p_order_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','auth'
AS $function$
DECLARE
  v_order public.coin_orders;
  v_wallet public.wallets;
  v_source public.spike_coin_source_balances;
  v_before bigint;
  v_after bigint;
  v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),'');
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_order_id IS NULL OR p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid order decision'; END IF;
  SELECT * INTO v_order FROM public.coin_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status<>'payment_reported' THEN RAISE EXCEPTION 'Only payment-reported orders can be decided'; END IF;
  IF p_decision='reject' THEN
    IF v_reason IS NULL THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
    UPDATE public.coin_orders SET status='rejected',rejection_reason=v_reason,updated_at=now() WHERE id=v_order.id;
    INSERT INTO public.notifications(user_id,type,data,priority)
    VALUES(v_order.user_id,'coin_order_rejected',jsonb_build_object('reference',v_order.reference,'reason',v_reason),'normal');
    INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
    VALUES(auth.uid(),'coin_order_rejected',v_order.user_id,'owner',jsonb_build_object('order_id',v_order.id,'reference',v_order.reference,'reason',v_reason));
    RETURN jsonb_build_object('ok',true,'status','rejected','reference',v_order.reference);
  END IF;

  INSERT INTO public.wallets(user_id,balance) VALUES(v_order.user_id,0) ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.spike_coin_source_balances(user_id,paid_balance,bonus_balance)
  VALUES(v_order.user_id,0,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_order.user_id FOR UPDATE;
  SELECT * INTO v_source FROM public.spike_coin_source_balances WHERE user_id=v_order.user_id FOR UPDATE;
  IF v_wallet.balance<>v_source.paid_balance+v_source.bonus_balance THEN RAISE EXCEPTION 'SP COIN source balances require reconciliation'; END IF;
  v_before:=v_wallet.balance;
  IF v_order.coins+v_order.bonus_coins>9223372036854775807-v_before THEN RAISE EXCEPTION 'Wallet balance overflow'; END IF;
  v_after:=v_before+v_order.coins+v_order.bonus_coins;
  UPDATE public.wallets SET balance=v_after,updated_at=now() WHERE user_id=v_order.user_id;
  UPDATE public.spike_coin_source_balances
  SET paid_balance=paid_balance+v_order.coins,bonus_balance=bonus_balance+v_order.bonus_coins,updated_at=now()
  WHERE user_id=v_order.user_id;
  INSERT INTO public.coin_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason,paid_amount,bonus_amount)
  VALUES(v_order.user_id,v_order.coins+v_order.bonus_coins,v_before,v_after,'purchase',v_order.id::text,
    'Approved SP Coin purchase '||v_order.reference,v_order.coins,v_order.bonus_coins);
  UPDATE public.coin_orders SET status='approved',updated_at=now() WHERE id=v_order.id;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_order.user_id,'coin_order_approved',jsonb_build_object('reference',v_order.reference,'coins',v_order.coins,
    'bonus_coins',v_order.bonus_coins,'balance_after',v_after),'high');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'coin_order_approved',v_order.user_id,'owner',jsonb_build_object('order_id',v_order.id,
    'reference',v_order.reference,'coins',v_order.coins,'bonus_coins',v_order.bonus_coins,
    'balance_before',v_before,'balance_after',v_after));
  RETURN jsonb_build_object('ok',true,'status','approved','reference',v_order.reference,
    'coins_credited',v_order.coins+v_order.bonus_coins,'paid_coins_credited',v_order.coins,
    'bonus_coins_credited',v_order.bonus_coins,'balance_before',v_before,'balance_after',v_after);
END;
$function$;

-- Manual Owner grants are promotional by default and cannot create cashable creator earnings.
CREATE OR REPLACE FUNCTION public.admin_grant_coins(p_user_id text,p_amount bigint,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth','private'
AS $function$
DECLARE
  actor uuid:=auth.uid();
  v_target_user_id uuid;
  v_wallet public.wallets;
  v_source public.spike_coin_source_balances;
  v_before bigint;
  v_after bigint;
  v_ref uuid:=gen_random_uuid();
  v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),'');
  v_identifier text:=nullif(trim(coalesce(p_user_id,'')),'');
BEGIN
  IF actor IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF v_identifier IS NULL THEN RAISE EXCEPTION 'Enter a valid SP ID or user UUID'; END IF;
  IF v_identifier~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id:=v_identifier::uuid;
  ELSE
    SELECT p.id INTO v_target_user_id FROM public.profiles p WHERE upper(p.sp_id)=upper(v_identifier) LIMIT 1;
    IF v_target_user_id IS NULL THEN RAISE EXCEPTION 'No SPIKE account found for SP ID: %',v_identifier USING errcode='P0002'; END IF;
  END IF;
  IF p_amount IS NULL OR p_amount<1 OR p_amount>1000000 THEN RAISE EXCEPTION 'Coin amount must be between 1 and 1,000,000'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_target_user_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'User not found' USING errcode='P0002'; END IF;

  INSERT INTO public.wallets(user_id,balance) VALUES(v_target_user_id,0) ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.spike_coin_source_balances(user_id,paid_balance,bonus_balance) VALUES(v_target_user_id,0,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_target_user_id FOR UPDATE;
  SELECT * INTO v_source FROM public.spike_coin_source_balances WHERE user_id=v_target_user_id FOR UPDATE;
  IF v_wallet.balance<>v_source.paid_balance+v_source.bonus_balance THEN RAISE EXCEPTION 'SP COIN source balances require reconciliation'; END IF;
  v_before:=v_wallet.balance;
  IF v_before>9223372036854775807-p_amount THEN RAISE EXCEPTION 'Coin balance overflow'; END IF;
  v_after:=v_before+p_amount;
  UPDATE public.wallets SET balance=v_after,updated_at=now() WHERE user_id=v_target_user_id;
  UPDATE public.spike_coin_source_balances SET bonus_balance=bonus_balance+p_amount,updated_at=now() WHERE user_id=v_target_user_id;
  INSERT INTO public.coin_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason,paid_amount,bonus_amount)
  VALUES(v_target_user_id,p_amount,v_before,v_after,'admin_adjustment',v_ref::text,v_reason,0,p_amount);
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(actor,'coins_granted',v_target_user_id,'owner',jsonb_build_object('amount',p_amount,'balance_before',v_before,
    'balance_after',v_after,'reason',v_reason,'reference_id',v_ref,'target_identifier',v_identifier,'coin_source','bonus'));
  RETURN jsonb_build_object('ok',true,'user_id',v_target_user_id,'amount',p_amount,'balance_before',v_before,
    'balance_after',v_after,'reference_id',v_ref,'reason',v_reason,'coin_source','bonus');
END;
$function$;

-- Extend gift records to distinguish the paid-funded and bonus-funded portions.
ALTER TABLE public.spike_room_gift_transactions
  ADD COLUMN IF NOT EXISTS paid_coin_spent integer NOT NULL DEFAULT 0 CHECK (paid_coin_spent>=0),
  ADD COLUMN IF NOT EXISTS bonus_coin_spent integer NOT NULL DEFAULT 0 CHECK (bonus_coin_spent>=0),
  ADD COLUMN IF NOT EXISTS paid_gift_value_minor bigint NOT NULL DEFAULT 0 CHECK (paid_gift_value_minor>=0),
  ADD COLUMN IF NOT EXISTS bonus_gift_value_minor bigint NOT NULL DEFAULT 0 CHECK (bonus_gift_value_minor>=0);
ALTER TABLE public.spike_room_gift_transactions
  DROP CONSTRAINT IF EXISTS spike_room_gift_transactions_check1,
  DROP CONSTRAINT IF EXISTS spike_room_gift_transactions_creator_gross_units_check,
  DROP CONSTRAINT IF EXISTS spike_room_gift_transactions_creator_net_units_check;
ALTER TABLE public.spike_room_gift_transactions
  ADD CONSTRAINT spike_room_gift_transactions_paid_bonus_coin_split_check CHECK (paid_coin_spent+bonus_coin_spent=coin_cost),
  ADD CONSTRAINT spike_room_gift_transactions_paid_bonus_value_split_check CHECK (paid_gift_value_minor+bonus_gift_value_minor=gift_value_minor),
  ADD CONSTRAINT spike_room_gift_transactions_paid_value_allocation_check CHECK (receiver_gross_minor+spike_minor+pool_minor=paid_gift_value_minor),
  ADD CONSTRAINT spike_room_gift_transactions_gross_units_nonnegative_check CHECK (creator_gross_units>=0),
  ADD CONSTRAINT spike_room_gift_transactions_net_units_nonnegative_check CHECK (creator_net_units>=0);

CREATE OR REPLACE FUNCTION public.spike_send_room_gift(p_room_id uuid,p_receiver_id uuid,p_gift_type text,p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_room public.spike_rooms;
  v_gift public.spike_gifts;
  v_policy public.spike_creator_withdrawal_policy;
  v_existing public.spike_room_gift_transactions;
  v_spend jsonb;
  v_gross_units_numeric numeric;
  v_gross_units bigint:=0;
  v_earning jsonb:='{}'::jsonb;
  v_share_units bigint:=0;
  v_net_units bigint:=0;
  v_share_minor bigint:=0;
  v_net_minor bigint:=0;
  v_paid_spent bigint:=0;
  v_bonus_spent bigint:=0;
  v_paid_value_minor bigint:=0;
  v_bonus_value_minor bigint:=0;
  v_receiver_gross_minor bigint:=0;
  v_spike_minor bigint:=0;
  v_pool_minor bigint:=0;
  v_ref text;
  v_tx_id uuid;
  v_balance_before bigint;
  v_balance_after bigint;
  v_receiver_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_room_id IS NULL OR p_receiver_id IS NULL OR p_request_id IS NULL OR nullif(trim(coalesce(p_gift_type,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Room, recipient, gift and request ID are required';
  END IF;
  IF p_receiver_id=v_uid THEN RAISE EXCEPTION 'You cannot send a gift to yourself'; END IF;
  SELECT * INTO v_existing FROM public.spike_room_gift_transactions WHERE sender_id=v_uid AND request_id=p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'already_processed',true,'reference',v_existing.reference,
      'gift_type',v_existing.gift_type,'gift_name',v_existing.gift_name,'gift_icon',v_existing.gift_icon,
      'coin_cost',v_existing.coin_cost,'sender_balance_after',v_existing.sender_balance_after,'receiver_id',v_existing.receiver_id);
  END IF;

  SELECT * INTO v_room FROM public.spike_rooms WHERE id=p_room_id FOR SHARE;
  IF NOT FOUND OR v_room.status<>'live' THEN RAISE EXCEPTION 'Gifts can only be sent in a live SPIKE room'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members WHERE room_id=p_room_id AND user_id=v_uid AND member_state='active') THEN
    RAISE EXCEPTION 'You must be an active member of this room to send gifts';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members WHERE room_id=p_room_id AND user_id=p_receiver_id AND member_state='active') THEN
    RAISE EXCEPTION 'The gift recipient must be an active member of this room';
  END IF;
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your SPIKE account restriction prevents sending gifts'; END IF;
  IF private.spike_user_is_restricted(p_receiver_id) THEN RAISE EXCEPTION 'This recipient cannot receive gifts at this time'; END IF;
  IF (SELECT count(*) FROM public.spike_room_gift_transactions WHERE sender_id=v_uid AND created_at>now()-interval '1 minute')>=10 THEN
    RAISE EXCEPTION 'Gift sending is temporarily rate-limited. Please wait before sending more gifts';
  END IF;

  SELECT * INTO v_gift FROM public.spike_gifts WHERE gift_type=p_gift_type AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This gift is not available'; END IF;
  IF v_gift.value_minor<>v_gift.coin_cost*200 THEN RAISE EXCEPTION 'Gift pricing is not aligned with the current SPIKE SP Coin price; contact the Owner'; END IF;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  IF v_policy.naira_per_earned_unit IS NULL OR v_policy.earned_units_per_coin<>1000 THEN RAISE EXCEPTION 'Creator earnings conversion is not configured'; END IF;
  v_ref:='SPG-'||upper(substr(replace(v_uid::text,'-',''),1,8))||'-'||upper(substr(replace(p_request_id::text,'-',''),1,16));

  v_spend:=private.spike_apply_coin_delta_with_sources(v_uid,-v_gift.coin_cost,'spend',v_ref,
    'Sent '||v_gift.name||' to a member in SPIKE room '||v_room.title);
  v_paid_spent:=coalesce((v_spend->>'paid_spent')::bigint,0);
  v_bonus_spent:=coalesce((v_spend->>'bonus_spent')::bigint,0);
  v_balance_after:=coalesce((v_spend->>'wallet_balance_after')::bigint,0);
  v_balance_before:=v_balance_after+v_gift.coin_cost;
  v_paid_value_minor:=v_paid_spent*200;
  v_bonus_value_minor:=v_bonus_spent*200;
  v_receiver_gross_minor:=round(v_gift.receiver_minor::numeric*v_paid_spent/v_gift.coin_cost)::bigint;
  v_spike_minor:=round(v_gift.spike_minor::numeric*v_paid_spent/v_gift.coin_cost)::bigint;
  v_pool_minor:=v_paid_value_minor-v_receiver_gross_minor-v_spike_minor;
  IF v_pool_minor<0 OR v_paid_value_minor+v_bonus_value_minor<>v_gift.value_minor THEN RAISE EXCEPTION 'Gift coin-source allocation is invalid'; END IF;

  IF v_receiver_gross_minor>0 THEN
    v_gross_units_numeric:=v_receiver_gross_minor/(v_policy.naira_per_earned_unit*100);
    IF v_gross_units_numeric<>round(v_gross_units_numeric) THEN RAISE EXCEPTION 'Gift creator share cannot be represented exactly in the Earning Coin ledger'; END IF;
    v_gross_units:=round(v_gross_units_numeric)::bigint;
    v_earning:=private.spike_credit_creator_earning(p_receiver_id,v_gross_units,'gift_share',v_ref,
      'Received '||v_gift.name||' in SPIKE room '||v_room.title,NULL);
    v_share_units:=coalesce((v_earning->>'platform_share_units')::bigint,0);
    v_net_units:=coalesce((v_earning->>'net_units')::bigint,0);
    v_share_minor:=round(v_share_units*v_policy.naira_per_earned_unit*100)::bigint;
    v_net_minor:=v_receiver_gross_minor-v_share_minor;
  END IF;
  IF v_net_minor<0 THEN RAISE EXCEPTION 'Creator gift settlement calculation is invalid'; END IF;
  SELECT coalesce(display_name,full_name,username,'SPIKE member') INTO v_receiver_name FROM public.profiles WHERE id=p_receiver_id;

  INSERT INTO public.spike_room_gift_transactions(
    request_id,reference,room_id,sender_id,receiver_id,gift_id,gift_type,gift_name,gift_icon,
    coin_cost,gift_value_minor,receiver_gross_minor,creator_share_minor,creator_net_minor,
    spike_minor,pool_minor,creator_gross_units,creator_platform_share_units,creator_net_units,
    sender_balance_before,sender_balance_after,paid_coin_spent,bonus_coin_spent,paid_gift_value_minor,bonus_gift_value_minor
  ) VALUES (
    p_request_id,v_ref,p_room_id,v_uid,p_receiver_id,v_gift.id,v_gift.gift_type,v_gift.name,v_gift.icon,
    v_gift.coin_cost,v_gift.value_minor,v_receiver_gross_minor,v_share_minor,v_net_minor,
    v_spike_minor,v_pool_minor,v_gross_units,v_share_units,v_net_units,
    v_balance_before,v_balance_after,v_paid_spent,v_bonus_spent,v_paid_value_minor,v_bonus_value_minor
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.gift_history(sender_id,receiver_id,gift_type,coin_cost,gems_earned,message_id)
  VALUES(v_uid,p_receiver_id,v_gift.gift_type,v_gift.coin_cost,0,NULL);
  IF v_spike_minor>0 THEN
    INSERT INTO public.spike_revenue(user_id,source,amount_minor,metadata)
    VALUES(v_uid,'gift_fee',v_spike_minor,jsonb_build_object('currency','NGN','gift_transaction_id',v_tx_id,
      'reference',v_ref,'room_id',p_room_id,'sender_id',v_uid,'receiver_id',p_receiver_id,
      'gift_type',v_gift.gift_type,'paid_gift_value_minor',v_paid_value_minor,'bonus_gift_value_minor',v_bonus_value_minor));
  END IF;
  IF v_pool_minor>0 THEN
    INSERT INTO public.spike_gift_pool_ledger(gift_transaction_id,reference,room_id,amount_minor)
    VALUES(v_tx_id,v_ref,p_room_id,v_pool_minor);
  END IF;
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(p_receiver_id,'room_gift_received',jsonb_build_object('reference',v_ref,'room_id',p_room_id,
    'sender_id',v_uid,'gift_type',v_gift.gift_type,'gift_name',v_gift.name,'gift_icon',v_gift.icon,'coin_cost',v_gift.coin_cost),'normal');
  RETURN jsonb_build_object('ok',true,'already_processed',false,'reference',v_ref,'gift_type',v_gift.gift_type,
    'gift_name',v_gift.name,'gift_icon',v_gift.icon,'coin_cost',v_gift.coin_cost,
    'sender_balance_after',v_balance_after,'receiver_id',p_receiver_id,'receiver_name',v_receiver_name,'created_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_send_room_gift(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_send_room_gift(uuid,uuid,text,uuid) TO authenticated;

-- Owner-only snapshot of paid and promotional coins still in circulation.
CREATE OR REPLACE FUNCTION public.admin_creator_revenue_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE
  v_entries bigint; v_revenue_minor bigint; v_gross_units numeric; v_share_units numeric; v_creator_net_units numeric;
  v_gift_base_minor bigint; v_gift_share_minor bigint; v_pool_minor bigint; v_gift_count bigint; v_coin_spend bigint;
  v_paid_outstanding bigint; v_bonus_outstanding bigint;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  SELECT count(*),coalesce(sum(amount_minor),0)::bigint,
    coalesce(sum((metadata->>'gross_earning_units')::numeric),0),
    coalesce(sum((metadata->>'platform_share_units')::numeric),0),
    coalesce(sum((metadata->>'creator_net_units')::numeric),0)
  INTO v_entries,v_revenue_minor,v_gross_units,v_share_units,v_creator_net_units
  FROM public.spike_revenue WHERE source='creator_earning_share';
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_gift_base_minor FROM public.spike_revenue WHERE source='gift_fee' AND metadata ? 'gift_transaction_id';
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_pool_minor FROM public.spike_gift_pool_ledger;
  SELECT count(*),coalesce(sum(coin_cost),0)::bigint INTO v_gift_count,v_coin_spend FROM public.spike_room_gift_transactions;
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_gift_share_minor FROM public.spike_revenue
    WHERE source='creator_earning_share' AND metadata->>'source_type'='gift_share';
  SELECT coalesce(sum(paid_balance),0)::bigint,coalesce(sum(bonus_balance),0)::bigint
    INTO v_paid_outstanding,v_bonus_outstanding FROM public.spike_coin_source_balances;
  RETURN jsonb_build_object(
    'entries',v_entries,'platform_share_revenue_minor',v_revenue_minor,'platform_share_revenue_naira',round(v_revenue_minor/100.0,2),
    'gross_earning_units',v_gross_units,'platform_share_units',v_share_units,'creator_net_units',v_creator_net_units,
    'earning_units_per_coin',1000,'gift_count',v_gift_count,'gift_coins_spent',v_coin_spend,
    'gift_base_revenue_minor',v_gift_base_minor,'gift_creator_share_minor',v_gift_share_minor,
    'gift_platform_revenue_minor',v_gift_base_minor+v_gift_share_minor,
    'gift_platform_revenue_naira',round((v_gift_base_minor+v_gift_share_minor)/100.0,2),
    'gift_pool_contribution_minor',v_pool_minor,'gift_pool_contribution_naira',round(v_pool_minor/100.0,2),
    'paid_coins_outstanding',v_paid_outstanding,'bonus_coins_outstanding',v_bonus_outstanding
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_creator_revenue_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_revenue_summary() TO authenticated;

COMMIT;
