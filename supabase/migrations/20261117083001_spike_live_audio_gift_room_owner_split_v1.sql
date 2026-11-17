BEGIN;

CREATE TABLE IF NOT EXISTS public.spike_live_audio_gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES public.spike_rooms(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  room_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  broadcaster_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  gift_id uuid NOT NULL REFERENCES public.spike_gifts(id) ON DELETE RESTRICT,
  gift_type text NOT NULL,
  gift_name text NOT NULL,
  gift_icon text NOT NULL,
  coin_cost integer NOT NULL CHECK (coin_cost > 0),
  paid_coin_spent integer NOT NULL CHECK (paid_coin_spent >= 0),
  bonus_coin_spent integer NOT NULL CHECK (bonus_coin_spent >= 0),
  paid_value_minor bigint NOT NULL CHECK (paid_value_minor >= 0),
  owner_gross_minor bigint NOT NULL CHECK (owner_gross_minor >= 0),
  broadcaster_gross_minor bigint NOT NULL CHECK (broadcaster_gross_minor >= 0),
  owner_gross_units bigint NOT NULL DEFAULT 0 CHECK (owner_gross_units >= 0),
  owner_platform_share_units bigint NOT NULL DEFAULT 0 CHECK (owner_platform_share_units >= 0),
  owner_net_units bigint NOT NULL DEFAULT 0 CHECK (owner_net_units >= 0),
  broadcaster_gross_units bigint NOT NULL DEFAULT 0 CHECK (broadcaster_gross_units >= 0),
  broadcaster_platform_share_units bigint NOT NULL DEFAULT 0 CHECK (broadcaster_platform_share_units >= 0),
  broadcaster_net_units bigint NOT NULL DEFAULT 0 CHECK (broadcaster_net_units >= 0),
  sender_balance_before bigint NOT NULL CHECK (sender_balance_before >= 0),
  sender_balance_after bigint NOT NULL CHECK (sender_balance_after >= 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id, request_id),
  CHECK (sender_id <> broadcaster_id),
  CHECK (paid_coin_spent + bonus_coin_spent = coin_cost),
  CHECK (paid_value_minor = paid_coin_spent * 200),
  CHECK (owner_gross_minor + broadcaster_gross_minor = paid_value_minor),
  CHECK (owner_gross_units = owner_platform_share_units + owner_net_units),
  CHECK (broadcaster_gross_units = broadcaster_platform_share_units + broadcaster_net_units)
);

CREATE INDEX IF NOT EXISTS spike_live_audio_gift_transactions_room_created_idx
  ON public.spike_live_audio_gift_transactions(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spike_live_audio_gift_transactions_owner_created_idx
  ON public.spike_live_audio_gift_transactions(room_owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spike_live_audio_gift_transactions_broadcaster_created_idx
  ON public.spike_live_audio_gift_transactions(broadcaster_id, created_at DESC);

ALTER TABLE public.spike_live_audio_gift_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spike_live_audio_gift_transactions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.spike_send_live_audio_gift(
  p_room_id uuid,
  p_gift_type text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.spike_rooms;
  v_session private.spike_room_live_audio_sessions;
  v_gift public.spike_gifts;
  v_policy public.spike_creator_withdrawal_policy;
  v_existing public.spike_live_audio_gift_transactions;
  v_spend jsonb;
  v_owner_earning jsonb := '{}'::jsonb;
  v_broadcaster_earning jsonb := '{}'::jsonb;
  v_owner_gross_units_numeric numeric := 0;
  v_broadcaster_gross_units_numeric numeric := 0;
  v_owner_gross_units bigint := 0;
  v_broadcaster_gross_units bigint := 0;
  v_owner_platform_units bigint := 0;
  v_owner_net_units bigint := 0;
  v_broadcaster_platform_units bigint := 0;
  v_broadcaster_net_units bigint := 0;
  v_paid_spent bigint := 0;
  v_bonus_spent bigint := 0;
  v_paid_value_minor bigint := 0;
  v_owner_gross_minor bigint := 0;
  v_broadcaster_gross_minor bigint := 0;
  v_balance_before bigint := 0;
  v_balance_after bigint := 0;
  v_ref text;
  v_receiver_name text;
  v_tx_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_room_id IS NULL OR p_request_id IS NULL OR nullif(trim(coalesce(p_gift_type,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Room, gift and request ID are required';
  END IF;

  SELECT * INTO v_existing
  FROM public.spike_live_audio_gift_transactions
  WHERE sender_id = v_uid AND request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_processed', true, 'reference', v_existing.reference,
      'gift_type', v_existing.gift_type, 'gift_name', v_existing.gift_name,
      'gift_icon', v_existing.gift_icon, 'coin_cost', v_existing.coin_cost,
      'sender_balance_after', v_existing.sender_balance_after,
      'broadcaster_id', v_existing.broadcaster_id,
      'owner_net_units', v_existing.owner_net_units,
      'broadcaster_net_units', v_existing.broadcaster_net_units
    );
  END IF;

  SELECT * INTO v_room
  FROM public.spike_rooms
  WHERE id = p_room_id AND status = 'live'
  FOR SHARE;
  IF NOT FOUND OR v_room.host_id IS NULL THEN
    RAISE EXCEPTION 'Gifts can only be sent in an active SPIKE room';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.spike_room_members
    WHERE room_id = p_room_id AND user_id = v_uid AND member_state = 'active'
  ) THEN RAISE EXCEPTION 'You must be an active member of this room to send gifts'; END IF;
  IF private.spike_user_is_restricted(v_uid) THEN
    RAISE EXCEPTION 'Your SPIKE account restriction prevents sending gifts';
  END IF;

  SELECT * INTO v_session
  FROM private.spike_room_live_audio_sessions
  WHERE room_id = p_room_id
    AND status = 'active'
    AND heartbeat_at >= now() - interval '90 seconds'
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gifts are available only while a member is broadcasting live'; END IF;
  IF v_session.broadcaster_id = v_uid THEN RAISE EXCEPTION 'You cannot gift your own live broadcast'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.spike_room_members
    WHERE room_id = p_room_id AND user_id = v_session.broadcaster_id AND member_state = 'active'
  ) THEN RAISE EXCEPTION 'The broadcaster is no longer an active room member'; END IF;
  IF private.spike_user_is_restricted(v_session.broadcaster_id)
     OR NOT private.spike_user_has_active_verified_subscription(v_session.broadcaster_id) THEN
    RAISE EXCEPTION 'This broadcaster is not eligible to receive gifts';
  END IF;

  IF (
    SELECT count(*) FROM public.spike_live_audio_gift_transactions
    WHERE sender_id = v_uid AND created_at > now() - interval '1 minute'
  ) >= 10 THEN
    RAISE EXCEPTION 'Gift sending is temporarily rate-limited. Please wait before sending more gifts';
  END IF;

  SELECT * INTO v_gift
  FROM public.spike_gifts
  WHERE gift_type = p_gift_type AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This gift is not available'; END IF;
  IF v_gift.value_minor <> v_gift.coin_cost * 200 THEN
    RAISE EXCEPTION 'Gift pricing is not aligned with the current SPIKE SP Coin price; contact the Owner';
  END IF;

  SELECT * INTO v_policy
  FROM public.spike_creator_withdrawal_policy
  WHERE singleton = true;
  IF NOT FOUND OR v_policy.naira_per_earned_unit IS NULL OR v_policy.earned_units_per_coin <> 1000 THEN
    RAISE EXCEPTION 'Creator earnings conversion is not configured';
  END IF;

  v_ref := 'SPLG-' || upper(substr(replace(v_uid::text,'-',''),1,8)) || '-' || upper(substr(replace(p_request_id::text,'-',''),1,16));
  v_spend := private.spike_apply_coin_delta_with_sources(
    v_uid, -v_gift.coin_cost, 'spend', v_ref,
    'Sent ' || v_gift.name || ' to the live broadcaster in SPIKE room ' || v_room.title
  );
  v_paid_spent := coalesce((v_spend->>'paid_spent')::bigint, 0);
  v_bonus_spent := coalesce((v_spend->>'bonus_spent')::bigint, 0);
  v_balance_after := coalesce((v_spend->>'wallet_balance_after')::bigint, 0);
  v_balance_before := v_balance_after + v_gift.coin_cost;
  IF v_paid_spent + v_bonus_spent <> v_gift.coin_cost THEN
    RAISE EXCEPTION 'Gift coin-source allocation is invalid';
  END IF;

  -- Bonus coins are spendable but do not create cash-backed creator earnings.
  -- Split the cash-backed value 50/50 between the room owner and live broadcaster.
  v_paid_value_minor := v_paid_spent * 200;
  v_owner_gross_minor := floor(v_paid_value_minor::numeric / 2)::bigint;
  v_broadcaster_gross_minor := v_paid_value_minor - v_owner_gross_minor;
  v_owner_gross_units_numeric := v_owner_gross_minor / (v_policy.naira_per_earned_unit * 100);
  v_broadcaster_gross_units_numeric := v_broadcaster_gross_minor / (v_policy.naira_per_earned_unit * 100);
  IF v_owner_gross_units_numeric <> round(v_owner_gross_units_numeric)
     OR v_broadcaster_gross_units_numeric <> round(v_broadcaster_gross_units_numeric) THEN
    RAISE EXCEPTION 'Live gift split cannot be represented exactly in the Earning Coin ledger';
  END IF;
  v_owner_gross_units := round(v_owner_gross_units_numeric)::bigint;
  v_broadcaster_gross_units := round(v_broadcaster_gross_units_numeric)::bigint;

  IF v_owner_gross_units > 0 THEN
    v_owner_earning := private.spike_credit_creator_earning(
      v_room.host_id, v_owner_gross_units, 'room_share', v_ref || ':OWNER',
      '50% room-owner share from a live-audio gift in SPIKE room ' || v_room.title, NULL
    );
    v_owner_platform_units := coalesce((v_owner_earning->>'platform_share_units')::bigint, 0);
    v_owner_net_units := coalesce((v_owner_earning->>'net_units')::bigint, 0);
  END IF;
  IF v_broadcaster_gross_units > 0 THEN
    v_broadcaster_earning := private.spike_credit_creator_earning(
      v_session.broadcaster_id, v_broadcaster_gross_units, 'gift_share', v_ref || ':BROADCASTER',
      '50% live-broadcaster share from a gift in SPIKE room ' || v_room.title, NULL
    );
    v_broadcaster_platform_units := coalesce((v_broadcaster_earning->>'platform_share_units')::bigint, 0);
    v_broadcaster_net_units := coalesce((v_broadcaster_earning->>'net_units')::bigint, 0);
  END IF;

  SELECT coalesce(display_name, full_name, username, 'SPIKE member')
  INTO v_receiver_name
  FROM public.profiles
  WHERE id = v_session.broadcaster_id;

  INSERT INTO public.spike_live_audio_gift_transactions (
    request_id, reference, room_id, sender_id, room_owner_id, broadcaster_id,
    gift_id, gift_type, gift_name, gift_icon, coin_cost,
    paid_coin_spent, bonus_coin_spent, paid_value_minor,
    owner_gross_minor, broadcaster_gross_minor,
    owner_gross_units, owner_platform_share_units, owner_net_units,
    broadcaster_gross_units, broadcaster_platform_share_units, broadcaster_net_units,
    sender_balance_before, sender_balance_after
  ) VALUES (
    p_request_id, v_ref, p_room_id, v_uid, v_room.host_id, v_session.broadcaster_id,
    v_gift.id, v_gift.gift_type, v_gift.name, v_gift.icon, v_gift.coin_cost,
    v_paid_spent, v_bonus_spent, v_paid_value_minor,
    v_owner_gross_minor, v_broadcaster_gross_minor,
    v_owner_gross_units, v_owner_platform_units, v_owner_net_units,
    v_broadcaster_gross_units, v_broadcaster_platform_units, v_broadcaster_net_units,
    v_balance_before, v_balance_after
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.gift_history(sender_id, receiver_id, gift_type, coin_cost, gems_earned, message_id)
  VALUES (v_uid, v_session.broadcaster_id, v_gift.gift_type, v_gift.coin_cost, 0, NULL);

  INSERT INTO public.notifications(user_id, type, data, priority)
  VALUES (
    v_session.broadcaster_id, 'room_gift_received',
    jsonb_build_object('reference',v_ref,'room_id',p_room_id,'sender_id',v_uid,
      'gift_type',v_gift.gift_type,'gift_name',v_gift.name,'gift_icon',v_gift.icon,
      'coin_cost',v_gift.coin_cost,'live_audio',true,'room_owner_share_percent',50),
    'normal'
  );
  IF v_room.host_id <> v_session.broadcaster_id THEN
    INSERT INTO public.notifications(user_id, type, data, priority)
    VALUES (
      v_room.host_id, 'room_owner_gift_share',
      jsonb_build_object('reference',v_ref,'room_id',p_room_id,'sender_id',v_uid,
        'broadcaster_id',v_session.broadcaster_id,'gift_type',v_gift.gift_type,
        'gift_name',v_gift.name,'gift_icon',v_gift.icon,'coin_cost',v_gift.coin_cost,
        'owner_gross_units',v_owner_gross_units,'owner_net_units',v_owner_net_units),
      'normal'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'already_processed', false, 'reference', v_ref,
    'gift_type', v_gift.gift_type, 'gift_name', v_gift.name, 'gift_icon', v_gift.icon,
    'coin_cost', v_gift.coin_cost, 'sender_balance_after', v_balance_after,
    'broadcaster_id', v_session.broadcaster_id, 'broadcaster_name', v_receiver_name,
    'room_owner_id', v_room.host_id, 'owner_gross_units', v_owner_gross_units,
    'owner_net_units', v_owner_net_units, 'broadcaster_gross_units', v_broadcaster_gross_units,
    'broadcaster_net_units', v_broadcaster_net_units, 'created_at', now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_send_live_audio_gift(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_send_live_audio_gift(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.spike_room_live_audio_gift_owner_summary(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_summary jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT host_id INTO v_owner FROM public.spike_rooms WHERE id = p_room_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Only the room owner can view room gift earnings' USING errcode='42501';
  END IF;
  SELECT jsonb_build_object(
    'gift_count', count(*),
    'paid_coins_spent', coalesce(sum(paid_coin_spent),0),
    'owner_gross_units', coalesce(sum(owner_gross_units),0),
    'owner_platform_share_units', coalesce(sum(owner_platform_share_units),0),
    'owner_net_units', coalesce(sum(owner_net_units),0)
  ) INTO v_summary
  FROM public.spike_live_audio_gift_transactions
  WHERE room_id = p_room_id AND room_owner_id = v_uid;
  RETURN coalesce(v_summary, '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_room_live_audio_gift_owner_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_room_live_audio_gift_owner_summary(uuid) TO authenticated;

COMMIT;
