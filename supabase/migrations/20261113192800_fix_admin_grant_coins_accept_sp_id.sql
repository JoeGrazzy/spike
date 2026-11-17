-- Resolve public SPIKE IDs to internal auth UUIDs before performing an Owner grant.
-- The transaction, wallet lock, coin ledger entry, and audit record remain atomic.
DROP FUNCTION public.admin_grant_coins(uuid,bigint,text);

CREATE FUNCTION public.admin_grant_coins(
  p_user_id text,
  p_amount bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, private
AS $function$
DECLARE
  actor uuid := auth.uid();
  v_target_user_id uuid;
  v_wallet public.wallets;
  v_before bigint;
  v_after bigint;
  v_ref uuid := gen_random_uuid();
  v_reason text := nullif(left(trim(coalesce(p_reason,'')),500),'');
  v_identifier text := nullif(trim(coalesce(p_user_id,'')),'');
BEGIN
  IF actor IS NULL OR NOT private.spike_is_owner() THEN
    RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501';
  END IF;

  IF v_identifier IS NULL THEN
    RAISE EXCEPTION 'Enter a valid SP ID or user UUID';
  END IF;

  IF v_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := v_identifier::uuid;
  ELSE
    SELECT p.id INTO v_target_user_id
    FROM public.profiles p
    WHERE upper(p.sp_id) = upper(v_identifier)
    LIMIT 1;
    IF v_target_user_id IS NULL THEN
      RAISE EXCEPTION 'No SPIKE account found for SP ID: %', v_identifier USING errcode='P0002';
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Coin amount must be between 1 and 1,000,000';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_target_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'User not found' USING errcode='P0002';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id,balance) VALUES(v_target_user_id,0)
    RETURNING * INTO v_wallet;
  END IF;

  v_before := coalesce(v_wallet.balance,0);
  IF v_before > 9223372036854775807 - p_amount THEN
    RAISE EXCEPTION 'Coin balance overflow';
  END IF;
  v_after := v_before + p_amount;

  UPDATE public.wallets SET balance=v_after, updated_at=now()
  WHERE user_id=v_target_user_id;

  INSERT INTO public.coin_ledger(
    user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason
  ) VALUES (
    v_target_user_id,p_amount,v_before,v_after,'admin_adjustment',v_ref::text,v_reason
  );

  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES (
    actor,'coins_granted',v_target_user_id,'owner',
    jsonb_build_object('amount',p_amount,'balance_before',v_before,
      'balance_after',v_after,'reason',v_reason,'reference_id',v_ref,
      'target_identifier',v_identifier)
  );

  RETURN jsonb_build_object(
    'ok',true,'user_id',v_target_user_id,'amount',p_amount,
    'balance_before',v_before,'balance_after',v_after,
    'reference_id',v_ref,'reason',v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_grant_coins(text,bigint,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_coins(text,bigint,text) TO authenticated;
