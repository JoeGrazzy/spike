-- SPIKE wallet gift-value visibility and complete creator-earnings history.
-- Gift face value is always shown; cash-backed earnings remain limited to paid coins.

CREATE INDEX IF NOT EXISTS spike_room_gift_receiver_created_idx
  ON public.spike_room_gift_transactions (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spike_live_audio_gift_broadcaster_created_idx
  ON public.spike_live_audio_gift_transactions (broadcaster_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.spike_my_received_gifts_internal(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_policy public.spike_creator_withdrawal_policy;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '28000';
  END IF;

  SELECT * INTO v_policy
  FROM public.spike_creator_withdrawal_policy
  WHERE singleton = true;

  WITH gift_rows AS (
    SELECT
      t.id::text AS id,
      t.reference,
      t.gift_name,
      t.gift_icon,
      t.gift_type,
      t.coin_cost::bigint AS coin_cost,
      t.sender_id,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'SPIKE member') AS sender_name,
      t.room_id,
      coalesce(r.title, 'SPIKE room') AS room_title,
      'room'::text AS gift_context,
      t.created_at,
      coalesce(t.gift_value_minor, t.coin_cost::bigint * 200)::bigint AS gift_value_minor,
      coalesce(t.paid_coin_spent, 0)::bigint AS paid_coin_spent,
      coalesce(t.bonus_coin_spent, 0)::bigint AS bonus_coin_spent,
      coalesce(t.paid_gift_value_minor, 0)::bigint AS paid_gift_value_minor,
      coalesce(t.bonus_gift_value_minor, 0)::bigint AS bonus_gift_value_minor,
      coalesce(t.receiver_gross_minor, 0)::bigint AS creator_gross_minor,
      coalesce(t.creator_share_minor, 0)::bigint AS creator_platform_share_minor,
      coalesce(t.creator_net_minor, 0)::bigint AS creator_net_minor,
      coalesce(t.creator_net_units, 0)::bigint AS creator_net_units
    FROM public.spike_room_gift_transactions t
    LEFT JOIN public.profiles p ON p.id = t.sender_id
    LEFT JOIN public.spike_rooms r ON r.id = t.room_id
    WHERE t.receiver_id = v_uid

    UNION ALL

    SELECT
      t.id::text AS id,
      t.reference,
      t.gift_name,
      t.gift_icon,
      t.gift_type,
      t.coin_cost::bigint AS coin_cost,
      t.sender_id,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'SPIKE member') AS sender_name,
      t.room_id,
      coalesce(r.title, 'SPIKE room') AS room_title,
      'live_audio'::text AS gift_context,
      t.created_at,
      (t.coin_cost::bigint * 200)::bigint AS gift_value_minor,
      coalesce(t.paid_coin_spent, 0)::bigint AS paid_coin_spent,
      greatest(t.coin_cost::bigint - coalesce(t.paid_coin_spent, 0), 0)::bigint AS bonus_coin_spent,
      coalesce(t.paid_value_minor, 0)::bigint AS paid_gift_value_minor,
      (greatest(t.coin_cost::bigint - coalesce(t.paid_coin_spent, 0), 0) * 200)::bigint AS bonus_gift_value_minor,
      coalesce(t.broadcaster_gross_minor, 0)::bigint AS creator_gross_minor,
      round(coalesce(t.broadcaster_platform_share_units, 0) * coalesce(v_policy.naira_per_earned_unit, 0) * 100)::bigint AS creator_platform_share_minor,
      round(coalesce(t.broadcaster_net_units, 0) * coalesce(v_policy.naira_per_earned_unit, 0) * 100)::bigint AS creator_net_minor,
      coalesce(t.broadcaster_net_units, 0)::bigint AS creator_net_units
    FROM public.spike_live_audio_gift_transactions t
    LEFT JOIN public.profiles p ON p.id = t.sender_id
    LEFT JOIN public.spike_rooms r ON r.id = t.room_id
    WHERE t.broadcaster_id = v_uid
  ),
  enriched AS (
    SELECT g.*,
      round(g.gift_value_minor::numeric / 100, 2) AS gift_value_naira,
      round(g.paid_gift_value_minor::numeric / 100, 2) AS paid_gift_value_naira,
      round(g.bonus_gift_value_minor::numeric / 100, 2) AS bonus_gift_value_naira,
      round(g.creator_gross_minor::numeric / 100, 2) AS creator_gross_naira,
      round(g.creator_platform_share_minor::numeric / 100, 2) AS creator_platform_share_naira,
      round(g.creator_net_minor::numeric / 100, 6) AS creator_net_naira,
      CASE WHEN coalesce(v_policy.usd_ngn_rate, 0) > 0
        THEN round(g.creator_net_minor::numeric / 100 / v_policy.usd_ngn_rate, 8)
        ELSE 0::numeric END AS creator_net_usd,
      CASE
        WHEN g.paid_coin_spent > 0 AND g.bonus_coin_spent > 0 THEN 'mixed'
        WHEN g.paid_coin_spent > 0 THEN 'paid'
        ELSE 'bonus'
      END AS funding_source
    FROM gift_rows g
  )
  SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT * FROM enriched
    ORDER BY created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  ) g;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.spike_my_received_gifts_internal(integer) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.spike_my_received_gifts_internal(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.spike_my_creator_earnings_v3()
RETURNS TABLE (
  id uuid,
  amount_units bigint,
  gross_amount_units bigint,
  platform_share_units bigint,
  amount_naira numeric,
  gross_amount_naira numeric,
  amount_usd numeric,
  source_type text,
  source_reference text,
  description text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_policy public.spike_creator_withdrawal_policy;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '28000';
  END IF;

  SELECT * INTO v_policy
  FROM public.spike_creator_withdrawal_policy
  WHERE singleton = true;

  RETURN QUERY
  SELECT
    l.id,
    l.amount_units,
    coalesce(l.gross_amount_units, l.amount_units),
    coalesce(l.platform_share_units, 0),
    round(l.amount_units::numeric * coalesce(l.naira_per_earned_unit_snapshot, v_policy.naira_per_earned_unit, 0), 8),
    round(coalesce(l.gross_amount_units, l.amount_units)::numeric * coalesce(l.naira_per_earned_unit_snapshot, v_policy.naira_per_earned_unit, 0), 8),
    CASE
      WHEN coalesce(l.usd_ngn_rate_snapshot, v_policy.usd_ngn_rate, 0) > 0
      THEN round(l.amount_units::numeric * coalesce(l.naira_per_earned_unit_snapshot, v_policy.naira_per_earned_unit, 0)
        / coalesce(l.usd_ngn_rate_snapshot, v_policy.usd_ngn_rate), 8)
      ELSE 0::numeric
    END,
    l.source_type,
    l.source_reference,
    l.description,
    l.created_at
  FROM public.spike_creator_earnings_ledger l
  WHERE l.user_id = v_uid
  ORDER BY l.created_at DESC
  LIMIT 100;
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_my_creator_earnings_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_my_creator_earnings_v3() TO authenticated;

CREATE OR REPLACE FUNCTION public.spike_my_gift_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_policy public.spike_creator_withdrawal_policy;
  v_gift_count bigint := 0;
  v_gift_sp bigint := 0;
  v_gift_value_minor bigint := 0;
  v_paid_value_minor bigint := 0;
  v_bonus_value_minor bigint := 0;
  v_creator_net_naira numeric := 0;
  v_creator_net_usd numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '28000';
  END IF;

  SELECT * INTO v_policy
  FROM public.spike_creator_withdrawal_policy
  WHERE singleton = true;

  SELECT
    count(*)::bigint,
    coalesce(sum(t.coin_cost), 0)::bigint,
    coalesce(sum(t.gift_value_minor), 0)::bigint,
    coalesce(sum(t.paid_gift_value_minor), 0)::bigint,
    coalesce(sum(t.bonus_gift_value_minor), 0)::bigint
  INTO v_gift_count, v_gift_sp, v_gift_value_minor, v_paid_value_minor, v_bonus_value_minor
  FROM public.spike_room_gift_transactions t
  WHERE t.receiver_id = v_uid;

  SELECT
    v_gift_count + count(*)::bigint,
    v_gift_sp + coalesce(sum(t.coin_cost), 0)::bigint,
    v_gift_value_minor + coalesce(sum(t.coin_cost::bigint * 200), 0)::bigint,
    v_paid_value_minor + coalesce(sum(t.paid_value_minor), 0)::bigint,
    v_bonus_value_minor + coalesce(sum(greatest(t.coin_cost::bigint - coalesce(t.paid_coin_spent, 0), 0) * 200), 0)::bigint
  INTO v_gift_count, v_gift_sp, v_gift_value_minor, v_paid_value_minor, v_bonus_value_minor
  FROM public.spike_live_audio_gift_transactions t
  WHERE t.broadcaster_id = v_uid;

  SELECT
    coalesce(sum(l.amount_units::numeric * coalesce(l.naira_per_earned_unit_snapshot, v_policy.naira_per_earned_unit, 0)), 0),
    coalesce(sum(CASE WHEN coalesce(l.usd_ngn_rate_snapshot, v_policy.usd_ngn_rate, 0) > 0
      THEN l.amount_units::numeric * coalesce(l.naira_per_earned_unit_snapshot, v_policy.naira_per_earned_unit, 0)
        / coalesce(l.usd_ngn_rate_snapshot, v_policy.usd_ngn_rate)
      ELSE 0 END), 0)
  INTO v_creator_net_naira, v_creator_net_usd
  FROM public.spike_creator_earnings_ledger l
  WHERE l.user_id = v_uid AND l.source_type = 'gift_share';

  RETURN jsonb_build_object(
    'gift_count', v_gift_count,
    'gift_sp_coins', v_gift_sp,
    'gift_value_minor', v_gift_value_minor,
    'gift_value_naira', round(v_gift_value_minor::numeric / 100, 2),
    'paid_gift_value_minor', v_paid_value_minor,
    'paid_gift_value_naira', round(v_paid_value_minor::numeric / 100, 2),
    'bonus_gift_value_minor', v_bonus_value_minor,
    'bonus_gift_value_naira', round(v_bonus_value_minor::numeric / 100, 2),
    'creator_net_earnings_naira', round(v_creator_net_naira, 8),
    'creator_net_earnings_usd', round(v_creator_net_usd, 8)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_my_gift_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_my_gift_wallet_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';
