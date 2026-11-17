BEGIN;

CREATE TABLE IF NOT EXISTS public.spike_room_gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES public.spike_rooms(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  gift_id uuid NOT NULL REFERENCES public.spike_gifts(id) ON DELETE RESTRICT,
  gift_type text NOT NULL,
  gift_name text NOT NULL,
  gift_icon text NOT NULL,
  coin_cost integer NOT NULL CHECK (coin_cost > 0),
  gift_value_minor bigint NOT NULL CHECK (gift_value_minor > 0),
  receiver_gross_minor bigint NOT NULL CHECK (receiver_gross_minor >= 0),
  creator_share_minor bigint NOT NULL CHECK (creator_share_minor >= 0),
  creator_net_minor bigint NOT NULL CHECK (creator_net_minor >= 0),
  spike_minor bigint NOT NULL CHECK (spike_minor >= 0),
  pool_minor bigint NOT NULL CHECK (pool_minor >= 0),
  creator_gross_units bigint NOT NULL CHECK (creator_gross_units > 0),
  creator_platform_share_units bigint NOT NULL CHECK (creator_platform_share_units >= 0),
  creator_net_units bigint NOT NULL CHECK (creator_net_units > 0),
  sender_balance_before bigint NOT NULL CHECK (sender_balance_before >= 0),
  sender_balance_after bigint NOT NULL CHECK (sender_balance_after >= 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id,request_id),
  CHECK (receiver_id <> sender_id),
  CHECK (receiver_gross_minor + spike_minor + pool_minor = gift_value_minor),
  CHECK (creator_share_minor + creator_net_minor = receiver_gross_minor)
);

CREATE INDEX IF NOT EXISTS spike_room_gift_transactions_room_created_idx
  ON public.spike_room_gift_transactions(room_id,created_at DESC);
CREATE INDEX IF NOT EXISTS spike_room_gift_transactions_receiver_created_idx
  ON public.spike_room_gift_transactions(receiver_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.spike_gift_pool_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_transaction_id uuid NOT NULL UNIQUE REFERENCES public.spike_room_gift_transactions(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES public.spike_rooms(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spike_room_gift_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spike_gift_pool_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spike_room_gift_transactions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.spike_gift_pool_ledger FROM PUBLIC,anon,authenticated;

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
  v_uid uuid := auth.uid();
  v_room public.spike_rooms;
  v_gift public.spike_gifts;
  v_policy public.spike_creator_withdrawal_policy;
  v_existing public.spike_room_gift_transactions;
  v_sender_wallet public.wallets;
  v_gross_units_numeric numeric;
  v_gross_units bigint;
  v_earning jsonb;
  v_share_units bigint;
  v_net_units bigint;
  v_share_minor bigint;
  v_net_minor bigint;
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

  SELECT * INTO v_existing FROM public.spike_room_gift_transactions
  WHERE sender_id=v_uid AND request_id=p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok',true,'already_processed',true,'reference',v_existing.reference,
      'gift_type',v_existing.gift_type,'gift_name',v_existing.gift_name,
      'gift_icon',v_existing.gift_icon,'coin_cost',v_existing.coin_cost,
      'sender_balance_after',v_existing.sender_balance_after,
      'receiver_id',v_existing.receiver_id
    );
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

  IF (SELECT count(*) FROM public.spike_room_gift_transactions
      WHERE sender_id=v_uid AND created_at>now()-interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'Gift sending is temporarily rate-limited. Please wait before sending more gifts';
  END IF;

  SELECT * INTO v_gift FROM public.spike_gifts WHERE gift_type=p_gift_type AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This gift is not available'; END IF;
  IF v_gift.value_minor <> v_gift.coin_cost*200 THEN
    RAISE EXCEPTION 'Gift pricing is not aligned with the current SPIKE SP Coin price; contact the Owner';
  END IF;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  IF v_policy.naira_per_earned_unit IS NULL OR v_policy.earned_units_per_coin<>1000 THEN
    RAISE EXCEPTION 'Creator earnings conversion is not configured';
  END IF;
  v_gross_units_numeric := v_gift.receiver_minor/(v_policy.naira_per_earned_unit*100);
  IF v_gross_units_numeric<=0 OR v_gross_units_numeric<>round(v_gross_units_numeric) THEN
    RAISE EXCEPTION 'Gift creator share cannot be represented exactly in the Earning Coin ledger';
  END IF;
  v_gross_units := round(v_gross_units_numeric)::bigint;
  v_ref := 'SPG-'||upper(substr(replace(v_uid::text,'-',''),1,8))||'-'||upper(substr(replace(p_request_id::text,'-',''),1,16));

  v_sender_wallet := private.apply_coin_delta(
    v_uid,-v_gift.coin_cost,'spend',v_ref,
    'Sent '||v_gift.name||' to a member in SPIKE room '||v_room.title
  );
  v_balance_after := v_sender_wallet.balance;
  v_balance_before := v_balance_after+v_gift.coin_cost;

  v_earning := private.spike_credit_creator_earning(
    p_receiver_id,v_gross_units,'gift_share',v_ref,
    'Received '||v_gift.name||' in SPIKE room '||v_room.title,NULL
  );
  v_share_units := coalesce((v_earning->>'platform_share_units')::bigint,0);
  v_net_units := coalesce((v_earning->>'net_units')::bigint,0);
  v_share_minor := round(v_share_units*v_policy.naira_per_earned_unit*100)::bigint;
  v_net_minor := v_gift.receiver_minor-v_share_minor;
  IF v_net_minor<0 OR v_net_units<=0 THEN RAISE EXCEPTION 'Creator gift settlement calculation is invalid'; END IF;

  SELECT coalesce(display_name,full_name,username,'SPIKE member') INTO v_receiver_name
  FROM public.profiles WHERE id=p_receiver_id;

  INSERT INTO public.spike_room_gift_transactions(
    request_id,reference,room_id,sender_id,receiver_id,gift_id,gift_type,gift_name,gift_icon,
    coin_cost,gift_value_minor,receiver_gross_minor,creator_share_minor,creator_net_minor,
    spike_minor,pool_minor,creator_gross_units,creator_platform_share_units,creator_net_units,
    sender_balance_before,sender_balance_after
  ) VALUES (
    p_request_id,v_ref,p_room_id,v_uid,p_receiver_id,v_gift.id,v_gift.gift_type,v_gift.name,v_gift.icon,
    v_gift.coin_cost,v_gift.value_minor,v_gift.receiver_minor,v_share_minor,v_net_minor,
    v_gift.spike_minor,v_gift.pool_minor,v_gross_units,v_share_units,v_net_units,
    v_balance_before,v_balance_after
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.gift_history(sender_id,receiver_id,gift_type,coin_cost,gems_earned,message_id)
  VALUES(v_uid,p_receiver_id,v_gift.gift_type,v_gift.coin_cost,0,NULL);

  IF v_gift.spike_minor>0 THEN
    INSERT INTO public.spike_revenue(user_id,source,amount_minor,metadata)
    VALUES(v_uid,'gift_fee',v_gift.spike_minor,jsonb_build_object(
      'currency','NGN','gift_transaction_id',v_tx_id,'reference',v_ref,
      'room_id',p_room_id,'sender_id',v_uid,'receiver_id',p_receiver_id,
      'gift_type',v_gift.gift_type,'gift_value_minor',v_gift.value_minor
    ));
  END IF;
  IF v_gift.pool_minor>0 THEN
    INSERT INTO public.spike_gift_pool_ledger(gift_transaction_id,reference,room_id,amount_minor)
    VALUES(v_tx_id,v_ref,p_room_id,v_gift.pool_minor);
  END IF;

  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(p_receiver_id,'room_gift_received',jsonb_build_object(
    'reference',v_ref,'room_id',p_room_id,'sender_id',v_uid,
    'gift_type',v_gift.gift_type,'gift_name',v_gift.name,'gift_icon',v_gift.icon,
    'coin_cost',v_gift.coin_cost
  ),'normal');

  RETURN jsonb_build_object(
    'ok',true,'already_processed',false,'reference',v_ref,
    'gift_type',v_gift.gift_type,'gift_name',v_gift.name,'gift_icon',v_gift.icon,
    'coin_cost',v_gift.coin_cost,'sender_balance_after',v_balance_after,
    'receiver_id',p_receiver_id,'receiver_name',v_receiver_name,
    'created_at',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_send_room_gift(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_send_room_gift(uuid,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.spike_room_gift_feed(p_room_id uuid)
RETURNS TABLE(
  reference text,
  gift_type text,
  gift_name text,
  gift_icon text,
  coin_cost integer,
  sender_id uuid,
  receiver_id uuid,
  sender_name text,
  receiver_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members WHERE room_id=p_room_id AND user_id=auth.uid() AND member_state='active') THEN
    RAISE EXCEPTION 'Active room membership is required';
  END IF;
  RETURN QUERY
  SELECT t.reference,t.gift_type,t.gift_name,t.gift_icon,t.coin_cost,t.sender_id,t.receiver_id,
    coalesce(sp.display_name,sp.full_name,sp.username,'SPIKE member'),
    coalesce(rp.display_name,rp.full_name,rp.username,'SPIKE member'),t.created_at
  FROM public.spike_room_gift_transactions t
  LEFT JOIN public.profiles sp ON sp.id=t.sender_id
  LEFT JOIN public.profiles rp ON rp.id=t.receiver_id
  WHERE t.room_id=p_room_id
  ORDER BY t.created_at DESC
  LIMIT 30;
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_room_gift_feed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_room_gift_feed(uuid) TO authenticated;

-- Extend the Owner summary with gift economics and the separately tracked reward-pool contribution.
CREATE OR REPLACE FUNCTION public.admin_creator_revenue_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE
  v_entries bigint;
  v_revenue_minor bigint;
  v_gross_units numeric;
  v_share_units numeric;
  v_creator_net_units numeric;
  v_gift_base_minor bigint;
  v_gift_share_minor bigint;
  v_pool_minor bigint;
  v_gift_count bigint;
  v_coin_spend bigint;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  SELECT count(*),coalesce(sum(amount_minor),0)::bigint,
    coalesce(sum((metadata->>'gross_earning_units')::numeric),0),
    coalesce(sum((metadata->>'platform_share_units')::numeric),0),
    coalesce(sum((metadata->>'creator_net_units')::numeric),0)
  INTO v_entries,v_revenue_minor,v_gross_units,v_share_units,v_creator_net_units
  FROM public.spike_revenue WHERE source='creator_earning_share';
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_gift_base_minor
  FROM public.spike_revenue WHERE source='gift_fee' AND metadata ? 'gift_transaction_id';
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_pool_minor FROM public.spike_gift_pool_ledger;
  SELECT count(*),coalesce(sum(coin_cost),0)::bigint INTO v_gift_count,v_coin_spend
  FROM public.spike_room_gift_transactions;
  v_gift_share_minor := coalesce((
    SELECT sum(amount_minor)::bigint FROM public.spike_revenue
    WHERE source='creator_earning_share' AND metadata->>'source_type'='gift_share'
  ),0);
  RETURN jsonb_build_object(
    'entries',v_entries,
    'platform_share_revenue_minor',v_revenue_minor,
    'platform_share_revenue_naira',round(v_revenue_minor/100.0,2),
    'gross_earning_units',v_gross_units,
    'platform_share_units',v_share_units,
    'creator_net_units',v_creator_net_units,
    'earning_units_per_coin',1000,
    'gift_count',v_gift_count,
    'gift_coins_spent',v_coin_spend,
    'gift_base_revenue_minor',v_gift_base_minor,
    'gift_creator_share_minor',v_gift_share_minor,
    'gift_platform_revenue_minor',v_gift_base_minor+v_gift_share_minor,
    'gift_platform_revenue_naira',round((v_gift_base_minor+v_gift_share_minor)/100.0,2),
    'gift_pool_contribution_minor',v_pool_minor,
    'gift_pool_contribution_naira',round(v_pool_minor/100.0,2)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_creator_revenue_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_revenue_summary() TO authenticated;

COMMIT;
