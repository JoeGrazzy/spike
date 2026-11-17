-- SPIKE Live Room paid message reactions and paid comments.
-- Ordinary emoji reactions remain free and continue using spike_room_react_message.
-- Paid rewards are funded only by purchased SP COINS so promotional bonus coins
-- cannot be converted into withdrawable creator earnings.

BEGIN;

ALTER TABLE public.spike_room_messages
  ADD COLUMN IF NOT EXISTS paid_reward_kind text,
  ADD COLUMN IF NOT EXISTS paid_reward_coin_cost integer;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.spike_room_messages'::regclass
      AND conname='spike_room_messages_paid_reward_kind_check'
  ) THEN
    ALTER TABLE public.spike_room_messages
      ADD CONSTRAINT spike_room_messages_paid_reward_kind_check
      CHECK (paid_reward_kind IS NULL OR paid_reward_kind='paid_comment');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.spike_room_messages'::regclass
      AND conname='spike_room_messages_paid_reward_cost_check'
  ) THEN
    ALTER TABLE public.spike_room_messages
      ADD CONSTRAINT spike_room_messages_paid_reward_cost_check
      CHECK (paid_reward_coin_cost IS NULL OR paid_reward_coin_cost IN (2,3,5));
  END IF;
END;
$block$;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.spike_room_messages'::regclass
      AND conname='spike_room_messages_paid_reward_pair_check'
  ) THEN
    ALTER TABLE public.spike_room_messages
      ADD CONSTRAINT spike_room_messages_paid_reward_pair_check
      CHECK (
        (paid_reward_kind IS NULL AND paid_reward_coin_cost IS NULL)
        OR (paid_reward_kind='paid_comment' AND paid_reward_coin_cost IN (2,3,5))
      );
  END IF;
END;
$block$;

CREATE TABLE IF NOT EXISTS public.spike_room_message_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES public.spike_rooms(id) ON DELETE RESTRICT,
  target_message_id uuid NOT NULL REFERENCES public.spike_room_messages(id) ON DELETE RESTRICT,
  comment_message_id uuid REFERENCES public.spike_room_messages(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reward_kind text NOT NULL CHECK (reward_kind IN ('reaction','comment')),
  reward_code text NOT NULL,
  reward_label text NOT NULL,
  comment_body text,
  coin_cost integer NOT NULL CHECK (coin_cost IN (2,3,5,7,10)),
  gross_earning_units bigint NOT NULL CHECK (gross_earning_units > 0),
  platform_share_units bigint NOT NULL CHECK (platform_share_units >= 0),
  net_earning_units bigint NOT NULL CHECK (net_earning_units > 0),
  sender_balance_before bigint NOT NULL CHECK (sender_balance_before >= 0),
  sender_balance_after bigint NOT NULL CHECK (sender_balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id,request_id),
  CHECK (sender_id <> receiver_id),
  CHECK (
    (reward_kind='reaction' AND reward_code IN ('spark_2','purple_3','bolt_5','crown_7','diamond_10') AND comment_body IS NULL AND comment_message_id IS NULL)
    OR
    (reward_kind='comment' AND reward_code IN ('quick_2','standard_3','special_5') AND char_length(btrim(coalesce(comment_body,''))) BETWEEN 1 AND 500 AND comment_message_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS spike_room_message_rewards_target_created_idx
  ON public.spike_room_message_rewards(target_message_id,created_at DESC);
CREATE INDEX IF NOT EXISTS spike_room_message_rewards_room_created_idx
  ON public.spike_room_message_rewards(room_id,created_at DESC);
CREATE INDEX IF NOT EXISTS spike_room_message_rewards_receiver_created_idx
  ON public.spike_room_message_rewards(receiver_id,created_at DESC);

ALTER TABLE public.spike_room_message_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spike_room_message_rewards FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.spike_room_reward_message(
  p_target_message_id uuid,
  p_reward_kind text,
  p_reward_code text,
  p_comment text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_target public.spike_room_messages;
  v_room public.spike_rooms;
  v_existing public.spike_room_message_rewards;
  v_wallet public.wallets;
  v_source public.spike_coin_source_balances;
  v_policy public.spike_creator_withdrawal_policy;
  v_comment_message public.spike_room_messages;
  v_cost integer;
  v_label text;
  v_gross_units bigint;
  v_earning jsonb;
  v_share_units bigint;
  v_net_units bigint;
  v_before bigint;
  v_after bigint;
  v_ref text;
  v_body text:=nullif(btrim(coalesce(p_comment,'')),'');
  v_tx_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_target_message_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Choose a message and retry'; END IF;
  IF p_reward_kind IS NULL OR p_reward_kind NOT IN ('reaction','comment') THEN RAISE EXCEPTION 'Choose a valid reward'; END IF;

  -- Serialize retries for the same sender/request so a repeated tap cannot charge twice.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text||':'||p_request_id::text,0)
  );
  SELECT * INTO v_existing
  FROM public.spike_room_message_rewards
  WHERE sender_id=v_uid AND request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.comment_message_id IS NOT NULL THEN
      SELECT * INTO v_comment_message FROM public.spike_room_messages WHERE id=v_existing.comment_message_id;
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'already_processed',true,'reference',v_existing.reference,
      'reward_kind',v_existing.reward_kind,'reward_code',v_existing.reward_code,
      'coin_cost',v_existing.coin_cost,'sender_balance_after',v_existing.sender_balance_after,
      'comment_message',CASE WHEN v_existing.comment_message_id IS NULL THEN NULL ELSE to_jsonb(v_comment_message) END
    );
  END IF;

  SELECT * INTO v_target
  FROM public.spike_room_messages
  WHERE id=p_target_message_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This message is no longer available'; END IF;
  IF v_target.sender_id=v_uid THEN RAISE EXCEPTION 'You cannot reward your own message'; END IF;

  SELECT * INTO v_room FROM public.spike_rooms
  WHERE id=v_target.room_id AND status='live' AND allow_chat=true
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room rewards are available only while room chat is live'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members WHERE room_id=v_room.id AND user_id=v_uid AND member_state='active') THEN
    RAISE EXCEPTION 'Join the room before sending a reward';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members WHERE room_id=v_room.id AND user_id=v_target.sender_id AND member_state='active') THEN
    RAISE EXCEPTION 'This member is no longer active in the room';
  END IF;
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your SPIKE account restriction prevents this action'; END IF;
  IF private.spike_user_is_restricted(v_target.sender_id) THEN RAISE EXCEPTION 'This member cannot receive rewards right now'; END IF;
  IF p_reward_kind='reaction' THEN
    CASE p_reward_code
      WHEN 'spark_2' THEN v_cost:=2; v_label:='Spark';
      WHEN 'purple_3' THEN v_cost:=3; v_label:='Purple heart';
      WHEN 'bolt_5' THEN v_cost:=5; v_label:='Bolt';
      WHEN 'crown_7' THEN v_cost:=7; v_label:='Crown';
      WHEN 'diamond_10' THEN v_cost:=10; v_label:='Diamond';
      ELSE RAISE EXCEPTION 'Choose a valid paid reaction';
    END CASE;
    IF v_body IS NOT NULL THEN RAISE EXCEPTION 'A reaction cannot include comment text'; END IF;
  ELSE
    CASE p_reward_code
      WHEN 'quick_2' THEN v_cost:=2; v_label:='Quick comment';
      WHEN 'standard_3' THEN v_cost:=3; v_label:='Standard comment';
      WHEN 'special_5' THEN v_cost:=5; v_label:='Special comment';
      ELSE RAISE EXCEPTION 'Choose a valid paid comment option';
    END CASE;
    IF v_body IS NULL OR char_length(v_body)>500 THEN RAISE EXCEPTION 'Write a comment of 1–500 characters'; END IF;
  END IF;

  IF (SELECT count(*) FROM public.spike_room_message_rewards
      WHERE sender_id=v_uid AND created_at>now()-interval '1 minute')>=20 THEN
    RAISE EXCEPTION 'You have sent several rewards recently. Please wait a moment';
  END IF;

  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  IF NOT FOUND OR v_policy.naira_per_earned_unit IS NULL OR v_policy.earned_units_per_coin<>1000 THEN
    RAISE EXCEPTION 'Creator earning conversion is not configured';
  END IF;
  v_gross_units:=round((v_cost*200)::numeric/(v_policy.naira_per_earned_unit*100))::bigint;
  IF v_gross_units<=0 OR v_gross_units>1000000000 THEN RAISE EXCEPTION 'Reward amount is outside the supported range'; END IF;

  INSERT INTO public.wallets(user_id,balance) VALUES(v_uid,0) ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.spike_coin_source_balances(user_id,paid_balance,bonus_balance)
  VALUES(v_uid,0,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_uid FOR UPDATE;
  SELECT * INTO v_source FROM public.spike_coin_source_balances WHERE user_id=v_uid FOR UPDATE;
  IF v_wallet.balance<>v_source.paid_balance+v_source.bonus_balance THEN
    RAISE EXCEPTION 'SP COIN source balances require reconciliation';
  END IF;
  IF v_source.paid_balance<v_cost THEN RAISE EXCEPTION 'Not enough purchased SP COINS for this reward'; END IF;
  v_before:=v_wallet.balance;
  v_after:=v_before-v_cost;
  UPDATE public.wallets SET balance=v_after,updated_at=now() WHERE user_id=v_uid;
  UPDATE public.spike_coin_source_balances
  SET paid_balance=paid_balance-v_cost,updated_at=now()
  WHERE user_id=v_uid;

  v_ref:='SPR-'||upper(substr(replace(v_uid::text,'-',''),1,8))||'-'||upper(substr(replace(p_request_id::text,'-',''),1,16));
  INSERT INTO public.coin_ledger(
    user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason,paid_amount,bonus_amount
  ) VALUES(
    v_uid,-v_cost,v_before,v_after,'spend',v_ref,
    'Room message reward in SPIKE room '||v_room.title,v_cost,0
  );

  IF p_reward_kind='comment' THEN
    INSERT INTO public.spike_room_messages(
      room_id,sender_id,body,reply_to_message_id,paid_reward_kind,paid_reward_coin_cost
    ) VALUES(
      v_room.id,v_uid,v_body,v_target.id,'paid_comment',v_cost
    ) RETURNING * INTO v_comment_message;
  END IF;

  v_earning:=private.spike_credit_creator_earning(
    v_target.sender_id,v_gross_units,'room_share',v_ref,
    CASE WHEN p_reward_kind='reaction' THEN 'Received a paid room reaction in SPIKE room '||v_room.title
         ELSE 'Received a paid room comment in SPIKE room '||v_room.title END,
    NULL
  );
  v_share_units:=coalesce((v_earning->>'platform_share_units')::bigint,0);
  v_net_units:=coalesce((v_earning->>'net_units')::bigint,0);
  IF v_net_units<=0 THEN RAISE EXCEPTION 'Reward settlement could not be completed'; END IF;

  INSERT INTO public.spike_room_message_rewards(
    request_id,reference,room_id,target_message_id,comment_message_id,sender_id,receiver_id,
    reward_kind,reward_code,reward_label,comment_body,coin_cost,gross_earning_units,
    platform_share_units,net_earning_units,sender_balance_before,sender_balance_after
  ) VALUES(
    p_request_id,v_ref,v_room.id,v_target.id,
    CASE WHEN p_reward_kind='comment' THEN v_comment_message.id ELSE NULL END,
    v_uid,v_target.sender_id,p_reward_kind,p_reward_code,v_label,v_body,v_cost,
    v_gross_units,v_share_units,v_net_units,v_before,v_after
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_target.sender_id,'room_message_reward_received',jsonb_build_object(
    'reference',v_ref,'room_id',v_room.id,'message_id',v_target.id,
    'sender_id',v_uid,'reward_kind',p_reward_kind,'reward_code',p_reward_code,
    'reward_label',v_label,'coin_cost',v_cost
  ),'normal');

  RETURN jsonb_build_object(
    'ok',true,'already_processed',false,'id',v_tx_id,'reference',v_ref,
    'reward_kind',p_reward_kind,'reward_code',p_reward_code,'reward_label',v_label,
    'coin_cost',v_cost,'sender_balance_after',v_after,
    'comment_message',CASE WHEN p_reward_kind='comment' THEN to_jsonb(v_comment_message) ELSE NULL END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_room_reward_message(uuid,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_room_reward_message(uuid,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.spike_room_get_paid_message_rewards(
  p_room_id uuid,
  p_message_ids uuid[]
) RETURNS TABLE(message_id uuid,reward_code text,reward_count bigint,coin_total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_room_id IS NULL OR coalesce(cardinality(p_message_ids),0)>60 THEN RAISE EXCEPTION 'Invalid room reward query'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members WHERE room_id=p_room_id AND user_id=auth.uid() AND member_state='active') THEN
    RAISE EXCEPTION 'Join the room before viewing message rewards';
  END IF;
  RETURN QUERY
  SELECT r.target_message_id,r.reward_code,count(*)::bigint,sum(r.coin_cost)::bigint
  FROM public.spike_room_message_rewards r
  WHERE r.room_id=p_room_id AND r.reward_kind='reaction'
    AND r.target_message_id=ANY(coalesce(p_message_ids,'{}'::uuid[]))
  GROUP BY r.target_message_id,r.reward_code;
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_room_get_paid_message_rewards(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_room_get_paid_message_rewards(uuid,uuid[]) TO authenticated;

COMMIT;
