-- Remove retired live-audio gift history from the admin account-deletion preflight.
-- Preserve all active wallet, room-gift, creator-earnings, report and storage blockers.
CREATE OR REPLACE FUNCTION private.admin_user_delete_preflight(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_fk record;
  v_count bigint;
  v_fk_blockers jsonb := '[]'::jsonb;
  v_financial jsonb := '[]'::jsonb;
  v_retained jsonb := '[]'::jsonb;
  v_item record;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN
    RAISE EXCEPTION 'SPIKE owner access required' USING errcode = '42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p_user_id AND u.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'User not found'; END IF;

  FOR v_fk IN
    SELECT c.conrelid::regclass::text AS table_name,
      string_agg(format('%I = $1', a.attname), ' and ') AS predicate
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey, c.confkey) k(attnum, confattnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = k.confattnum
    WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r')
      AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
      AND ta.attname = 'id'
    GROUP BY c.oid, c.conrelid
  LOOP
    EXECUTE format('select count(*) from %s where %s', v_fk.table_name, v_fk.predicate)
      INTO v_count USING p_user_id;
    IF v_count > 0 THEN
      v_fk_blockers := v_fk_blockers || jsonb_build_array(
        jsonb_build_object('table', v_fk.table_name, 'rows', v_count));
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM (VALUES
    ('public.wallets', 'user_id', 'balance > 0'),
    ('public.coin_ledger', 'user_id', 'true'),
    ('public.coin_orders', 'user_id', 'true'),
    ('public.coin_transactions', 'user_id', 'true'),
    ('public.gem_transactions', 'user_id', 'true'),
    ('public.gift_history', 'sender_id', 'true'),
    ('public.gift_history', 'receiver_id', 'true'),
    ('public.spike_room_gift_transactions', 'sender_id', 'true'),
    ('public.spike_room_gift_transactions', 'receiver_id', 'true'),
    ('public.spike_creator_earnings_ledger', 'user_id', 'true'),
    ('public.spike_creator_wallets', 'user_id', 'true'),
    ('public.spike_creator_withdrawals', 'user_id', 'true'),
    ('public.spike_creator_payout_accounts', 'user_id', 'true'),
    ('public.spike_payout_accounts', 'user_id', 'true'),
    ('public.monthly_payouts', 'user_id', 'true'),
    ('public.spike_revenue', 'user_id', 'true'),
    ('public.spike_room_message_rewards', 'sender_id', 'true'),
    ('public.spike_room_message_rewards', 'receiver_id', 'true'),
    ('public.spike_coin_source_balances', 'user_id', 'paid_balance > 0 or bonus_balance > 0'),
    ('private.spike_verified_subscriptions', 'user_id', 'true')
  ) x(table_name, column_name, condition)
  LOOP
    IF to_regclass(v_item.table_name) IS NOT NULL THEN
      EXECUTE format('select count(*) from %s where %I = $1 and (%s)',
        v_item.table_name, v_item.column_name, v_item.condition) INTO v_count USING p_user_id;
      IF v_count > 0 THEN
        v_financial := v_financial || jsonb_build_array(
          jsonb_build_object('table', v_item.table_name, 'rows', v_count));
      END IF;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM (VALUES
    ('public.profile_reports', 'reported_user_id'),
    ('public.profile_reports', 'reporter_id'),
    ('public.spike_support_cases', 'user_id'),
    ('public.spike_room_reports', 'reporter_id'),
    ('public.spike_room_message_reports', 'reporter_id'),
    ('public.feed_reports', 'reporter_id'),
    ('public.referrals', 'referrer_id'),
    ('public.referrals', 'referred_id'),
    ('private.spike_referral_attributions', 'inviter_id'),
    ('private.spike_referral_attributions', 'invitee_id'),
    ('private.spike_referral_point_ledger', 'user_id')
  ) x(table_name, column_name)
  LOOP
    IF to_regclass(v_item.table_name) IS NOT NULL THEN
      EXECUTE format('select count(*) from %s where %I = $1', v_item.table_name, v_item.column_name)
        INTO v_count USING p_user_id;
      IF v_count > 0 THEN
        v_retained := v_retained || jsonb_build_array(
          jsonb_build_object('table', v_item.table_name, 'rows', v_count));
      END IF;
    END IF;
  END LOOP;

  IF to_regclass('public.spike_room_reports') IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.spike_room_reports rr
    JOIN public.spike_rooms r ON r.id = rr.room_id WHERE r.host_id = p_user_id;
    IF v_count > 0 THEN
      v_retained := v_retained || jsonb_build_array(
        jsonb_build_object('table', 'public.spike_room_reports_about_hosted_rooms', 'rows', v_count));
    END IF;
  END IF;
  IF to_regclass('public.spike_room_message_reports') IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.spike_room_message_reports mr
    JOIN public.spike_room_messages m ON m.id = mr.message_id WHERE m.sender_id = p_user_id;
    IF v_count > 0 THEN
      v_retained := v_retained || jsonb_build_array(
        jsonb_build_object('table', 'public.spike_room_message_reports_about_user', 'rows', v_count));
    END IF;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'select count(*) from storage.objects where owner = $1 or owner_id = $1::text'
      INTO v_count USING p_user_id;
    IF v_count > 0 THEN
      v_retained := v_retained || jsonb_build_array(
        jsonb_build_object('table', 'storage.objects', 'rows', v_count));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'allowed', jsonb_array_length(v_fk_blockers) = 0
      AND jsonb_array_length(v_financial) = 0 AND jsonb_array_length(v_retained) = 0,
    'foreign_key_blockers', v_fk_blockers,
    'financial_history', v_financial,
    'retained_history', v_retained,
    'message', CASE
      WHEN jsonb_array_length(v_financial) > 0 THEN
        'Deletion is blocked because this account has financial or gift history that must be retained.'
      WHEN jsonb_array_length(v_retained) > 0 THEN
        'Deletion is blocked because this account has report, support, referral or stored-file history that must be retained.'
      WHEN jsonb_array_length(v_fk_blockers) > 0 THEN
        'Deletion is blocked by linked records that must be resolved or retained.'
      ELSE 'Preflight passed. Permanent deletion will remove the account and remaining cascading personal records.'
    END);
END;
$function$;
