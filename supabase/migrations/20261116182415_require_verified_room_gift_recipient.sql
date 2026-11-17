-- Require an approved, currently active SPIKE Verified subscription before room gifts can be received.
-- The existing helper checks plan, payment approval, starts_at/expires_at, and account restrictions.
CREATE OR REPLACE FUNCTION public.spike_send_room_gift(
  p_room_id uuid,
  p_receiver_id uuid,
  p_gift_type text,
  p_request_id uuid
)
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
  IF NOT private.spike_user_has_active_verified_subscription(p_receiver_id) THEN
    RAISE EXCEPTION 'Only members with an active SPIKE Verified badge can receive gifts';
  END IF;
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
