-- Remove stale references to the retired Rooms live-audio gift ledger.
-- Preserve chat-room gift history, wallet response fields, and authenticated-only RPC access.

CREATE OR REPLACE FUNCTION private.spike_my_received_gifts_internal(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_policy public.spike_creator_withdrawal_policy;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode = '28000'; END IF;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton = true;
  WITH gift_rows AS (
    SELECT t.id::text id,t.reference,t.gift_name,t.gift_icon,t.gift_type,t.coin_cost::bigint coin_cost,t.sender_id,
      coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'SPIKE member') sender_name,
      t.room_id,coalesce(r.title,'SPIKE room') room_title,'room'::text gift_context,t.created_at,
      coalesce(t.gift_value_minor,t.coin_cost::bigint*200)::bigint gift_value_minor,
      coalesce(t.paid_coin_spent,0)::bigint paid_coin_spent,coalesce(t.bonus_coin_spent,0)::bigint bonus_coin_spent,
      coalesce(t.paid_gift_value_minor,0)::bigint paid_gift_value_minor,coalesce(t.bonus_gift_value_minor,0)::bigint bonus_gift_value_minor,
      coalesce(t.receiver_gross_minor,0)::bigint creator_gross_minor,coalesce(t.creator_share_minor,0)::bigint creator_platform_share_minor,
      coalesce(t.creator_net_minor,0)::bigint creator_net_minor,coalesce(t.creator_net_units,0)::bigint creator_net_units
    FROM public.spike_room_gift_transactions t
    LEFT JOIN public.profiles p ON p.id=t.sender_id LEFT JOIN public.spike_rooms r ON r.id=t.room_id
    WHERE t.receiver_id=v_uid
  ), enriched AS (
    SELECT g.*,round(g.gift_value_minor::numeric/100,2) gift_value_naira,
      round(g.paid_gift_value_minor::numeric/100,2) paid_gift_value_naira,
      round(g.bonus_gift_value_minor::numeric/100,2) bonus_gift_value_naira,
      round(g.creator_gross_minor::numeric/100,2) creator_gross_naira,
      round(g.creator_platform_share_minor::numeric/100,2) creator_platform_share_naira,
      round(g.creator_net_minor::numeric/100,6) creator_net_naira,
      CASE WHEN coalesce(v_policy.usd_ngn_rate,0)>0 THEN round(g.creator_net_minor::numeric/100/v_policy.usd_ngn_rate,8) ELSE 0::numeric END creator_net_usd,
      CASE WHEN g.paid_coin_spent>0 AND g.bonus_coin_spent>0 THEN 'mixed' WHEN g.paid_coin_spent>0 THEN 'paid' ELSE 'bonus' END funding_source
    FROM gift_rows g
  )
  SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC),'[]'::jsonb) INTO v_result
  FROM (SELECT * FROM enriched ORDER BY created_at DESC LIMIT greatest(1,least(coalesce(p_limit,50),100))) g;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spike_my_gift_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_policy public.spike_creator_withdrawal_policy;
  v_gift_count bigint:=0;v_gift_sp bigint:=0;v_gift_value_minor bigint:=0;v_paid_value_minor bigint:=0;v_bonus_value_minor bigint:=0;
  v_creator_net_naira numeric:=0;v_creator_net_usd numeric:=0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT * INTO v_policy FROM public.spike_creator_withdrawal_policy WHERE singleton=true;
  SELECT count(*)::bigint,coalesce(sum(t.coin_cost),0)::bigint,coalesce(sum(t.gift_value_minor),0)::bigint,
    coalesce(sum(t.paid_gift_value_minor),0)::bigint,coalesce(sum(t.bonus_gift_value_minor),0)::bigint
  INTO v_gift_count,v_gift_sp,v_gift_value_minor,v_paid_value_minor,v_bonus_value_minor
  FROM public.spike_room_gift_transactions t WHERE t.receiver_id=v_uid;
  SELECT coalesce(sum(l.amount_units::numeric*coalesce(l.naira_per_earned_unit_snapshot,v_policy.naira_per_earned_unit,0)),0),
    coalesce(sum(CASE WHEN coalesce(l.usd_ngn_rate_snapshot,v_policy.usd_ngn_rate,0)>0
      THEN l.amount_units::numeric*coalesce(l.naira_per_earned_unit_snapshot,v_policy.naira_per_earned_unit,0)/coalesce(l.usd_ngn_rate_snapshot,v_policy.usd_ngn_rate) ELSE 0 END),0)
  INTO v_creator_net_naira,v_creator_net_usd
  FROM public.spike_creator_earnings_ledger l WHERE l.user_id=v_uid AND l.source_type='gift_share';
  RETURN jsonb_build_object('gift_count',v_gift_count,'gift_sp_coins',v_gift_sp,
    'gift_value_minor',v_gift_value_minor,'gift_value_naira',round(v_gift_value_minor::numeric/100,2),
    'paid_gift_value_minor',v_paid_value_minor,'paid_gift_value_naira',round(v_paid_value_minor::numeric/100,2),
    'bonus_gift_value_minor',v_bonus_value_minor,'bonus_gift_value_naira',round(v_bonus_value_minor::numeric/100,2),
    'creator_net_earnings_naira',round(v_creator_net_naira,8),'creator_net_earnings_usd',round(v_creator_net_usd,8));
END;
$function$;

CREATE OR REPLACE FUNCTION public.spike_reconcile_my_gift_earnings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_row record; v_existing public.spike_creator_earnings_ledger; v_credit jsonb;
  v_checked integer:=0;v_credited integer:=0;v_net_units bigint:=0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('spike-gift-earnings:'||v_uid::text,0));
  FOR v_row IN
    SELECT t.receiver_id AS user_id,'gift_share'::text AS source_type,t.reference AS source_reference,
      t.creator_gross_units AS gross_units,t.creator_net_units AS expected_net_units,
      'Received '||t.gift_name||' in SPIKE room '||r.title AS description
    FROM public.spike_room_gift_transactions t JOIN public.spike_rooms r ON r.id=t.room_id
    WHERE t.receiver_id=v_uid AND t.creator_gross_units>0
  LOOP
    v_checked:=v_checked+1;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||v_row.source_type||':'||v_row.source_reference,0));
    SELECT * INTO v_existing FROM public.spike_creator_earnings_ledger l
      WHERE l.user_id=v_uid AND l.source_type=v_row.source_type AND l.source_reference=v_row.source_reference
      ORDER BY l.created_at DESC LIMIT 1;
    IF FOUND THEN
      IF v_existing.amount_units<>v_row.expected_net_units OR coalesce(v_existing.gross_amount_units,v_existing.amount_units)<>v_row.gross_units
      THEN RAISE EXCEPTION 'Gift earnings ledger mismatch for reference %; no repair was applied',v_row.source_reference; END IF;
      v_net_units:=v_net_units+v_existing.amount_units; CONTINUE;
    END IF;
    v_credit:=private.spike_credit_creator_earning(v_uid,v_row.gross_units,v_row.source_type,v_row.source_reference,v_row.description,NULL);
    IF coalesce((v_credit->>'net_units')::bigint,-1)<>v_row.expected_net_units
    THEN RAISE EXCEPTION 'Gift earnings policy no longer matches transaction %; no repair was applied',v_row.source_reference; END IF;
    v_credited:=v_credited+1;v_net_units:=v_net_units+v_row.expected_net_units;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'transactions_checked',v_checked,'missing_credits_restored',v_credited,
    'verified_net_units',v_net_units,'legacy_gift_history_excluded',true);
END;
$function$;
