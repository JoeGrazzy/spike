BEGIN;

-- Self-service, idempotent repair for gift transactions whose authoritative
-- settlement row exists but whose matching creator ledger credit is missing.
-- Legacy gift_history rows are intentionally excluded: they do not retain
-- paid/bonus coin allocation and cannot safely prove cash-backed earnings.
CREATE OR REPLACE FUNCTION public.spike_reconcile_my_gift_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_existing public.spike_creator_earnings_ledger;
  v_credit jsonb;
  v_checked integer := 0;
  v_credited integer := 0;
  v_net_units bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode='28000';
  END IF;

  -- Serialize concurrent wallet refreshes for this account.
  PERFORM pg_advisory_xact_lock(hashtextextended('spike-gift-earnings:' || v_uid::text, 0));

  FOR v_row IN
    SELECT t.receiver_id AS user_id, 'gift_share'::text AS source_type,
           t.reference AS source_reference, t.creator_gross_units AS gross_units,
           t.creator_net_units AS expected_net_units,
           'Received ' || t.gift_name || ' in SPIKE room ' || r.title AS description
    FROM public.spike_room_gift_transactions t
    JOIN public.spike_rooms r ON r.id = t.room_id
    WHERE t.receiver_id = v_uid AND t.creator_gross_units > 0

    UNION ALL

    SELECT t.room_owner_id, 'room_share', t.reference || ':OWNER',
           t.owner_gross_units, t.owner_net_units,
           '50% room-owner share from a live-audio gift in SPIKE room ' || r.title
    FROM public.spike_live_audio_gift_transactions t
    JOIN public.spike_rooms r ON r.id = t.room_id
    WHERE t.room_owner_id = v_uid AND t.owner_gross_units > 0

    UNION ALL

    SELECT t.broadcaster_id, 'gift_share', t.reference || ':BROADCASTER',
           t.broadcaster_gross_units, t.broadcaster_net_units,
           '50% live-broadcaster share from a gift in SPIKE room ' || r.title
    FROM public.spike_live_audio_gift_transactions t
    JOIN public.spike_rooms r ON r.id = t.room_id
    WHERE t.broadcaster_id = v_uid AND t.broadcaster_gross_units > 0
  LOOP
    v_checked := v_checked + 1;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_row.source_type || ':' || v_row.source_reference, 0));

    SELECT * INTO v_existing
    FROM public.spike_creator_earnings_ledger l
    WHERE l.user_id = v_uid
      AND l.source_type = v_row.source_type
      AND l.source_reference = v_row.source_reference
    ORDER BY l.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_existing.amount_units <> v_row.expected_net_units
         OR coalesce(v_existing.gross_amount_units, v_existing.amount_units) <> v_row.gross_units THEN
        RAISE EXCEPTION 'Gift earnings ledger mismatch for reference %; no repair was applied', v_row.source_reference;
      END IF;
      v_net_units := v_net_units + v_existing.amount_units;
      CONTINUE;
    END IF;

    v_credit := private.spike_credit_creator_earning(
      v_uid, v_row.gross_units, v_row.source_type, v_row.source_reference,
      v_row.description, NULL
    );

    IF coalesce((v_credit->>'net_units')::bigint, -1) <> v_row.expected_net_units THEN
      RAISE EXCEPTION 'Gift earnings policy no longer matches transaction %; no repair was applied', v_row.source_reference;
    END IF;

    v_credited := v_credited + 1;
    v_net_units := v_net_units + v_row.expected_net_units;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'transactions_checked', v_checked,
    'missing_credits_restored', v_credited,
    'verified_net_units', v_net_units,
    'legacy_gift_history_excluded', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.spike_reconcile_my_gift_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_reconcile_my_gift_earnings() TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
