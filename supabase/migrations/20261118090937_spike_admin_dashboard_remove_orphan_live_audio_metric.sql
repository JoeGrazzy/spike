-- SPIKE Rooms is currently chat-only. The former live-audio session table
-- was removed, so the admin dashboard must not query that orphan relation.
-- Keep the JSON key temporarily for older dashboard clients.
CREATE OR REPLACE FUNCTION private.admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total_users bigint;
  v_verified_users bigint;
  v_coin_balance bigint;
  v_creator_earning_units bigint;
  v_earning_units_per_coin numeric;
  v_active_rooms bigint;
  v_today_start timestamptz;
  v_today_end timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN
    RAISE EXCEPTION 'Super administrator access required'
      USING ERRCODE = '42501';
  END IF;

  v_today_start := date_trunc('day', now() AT TIME ZONE 'Africa/Lagos')
                   AT TIME ZONE 'Africa/Lagos';
  v_today_end := v_today_start + interval '1 day';

  SELECT count(*) INTO v_total_users FROM auth.users;

  SELECT count(*) INTO v_verified_users
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE coalesce(p.verified, false) = true;

  SELECT coalesce(sum(w.balance), 0)::bigint INTO v_coin_balance
  FROM public.wallets w;

  SELECT coalesce(sum(l.amount_units) FILTER (WHERE l.amount_units > 0), 0)::bigint
    INTO v_creator_earning_units
  FROM public.spike_creator_earnings_ledger l;

  SELECT coalesce(nullif(p.earned_units_per_coin, 0), 1000)::numeric
    INTO v_earning_units_per_coin
  FROM public.spike_creator_withdrawal_policy p
  WHERE p.singleton = true;
  v_earning_units_per_coin := coalesce(nullif(v_earning_units_per_coin, 0), 1000);

  SELECT count(*) INTO v_active_rooms
  FROM public.spike_rooms r
  WHERE r.status = 'live' AND r.ended_at IS NULL;

  RETURN jsonb_build_object(
    'users', v_total_users,
    'rooms', v_active_rooms,
    'messages', (SELECT count(*) FROM public.private_messages),
    'notifications', (SELECT count(*) FROM public.notifications),
    'coins', v_coin_balance,
    'active_packages', (SELECT count(*) FROM public.coin_packages WHERE active = true),
    'pending_orders', (SELECT count(*) FROM public.coin_orders WHERE status IN ('pending', 'payment_reported')),
    'pending_room_purchases', 0,
    'coin_orders', (SELECT count(*) FROM public.coin_orders),
    'total_registered_users', v_total_users,
    'active_users', (
      SELECT count(DISTINCT up.user_id)
      FROM public.user_presence up
      WHERE up.last_seen >= now() - interval '30 days'
    ),
    'online_users', (
      SELECT count(DISTINCT up.user_id)
      FROM public.user_presence up
      LEFT JOIN public.profile_privacy pp ON pp.user_id = up.user_id
      WHERE up.last_seen >= now() - interval '90 seconds'
        AND coalesce(pp.show_online_status, true) = true
    ),
    'new_registrations_today', (
      SELECT count(*) FROM auth.users u
      WHERE u.created_at >= v_today_start AND u.created_at < v_today_end
    ),
    'verified_users', v_verified_users,
    'unverified_users', greatest(v_total_users - v_verified_users, 0),
    'suspended_accounts', (
      SELECT count(*) FROM public.profiles p
      WHERE p.restricted_at IS NOT NULL
        AND (p.restricted_until IS NULL OR p.restricted_until > now())
    ),
    'total_active_rooms', v_active_rooms,
    'live_audio_rooms', 0,
    'total_gifts_sent', (SELECT count(*) FROM public.gift_history),
    'total_sp_coins_in_circulation', v_coin_balance,
    'total_creator_earnings', round(v_creator_earning_units::numeric / v_earning_units_per_coin, 3),
    'total_creator_earnings_units', v_creator_earning_units,
    'pending_withdrawals', (
      SELECT count(*) FROM public.spike_creator_withdrawals w WHERE w.status = 'pending'
    ),
    'pending_verification_requests', (
      SELECT count(*) FROM private.spike_verified_identities v WHERE v.status = 'pending'
    ),
    'active_users_window_days', 30,
    'online_users_window_seconds', 90
  );
END;
$function$;
