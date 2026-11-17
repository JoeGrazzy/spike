-- Auditable requester and dedicated-Owner cancellation for SP Coin purchase requests.
BEGIN;
ALTER TABLE public.coin_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.coin_orders DROP CONSTRAINT IF EXISTS coin_orders_status_check;
ALTER TABLE public.coin_orders ADD CONSTRAINT coin_orders_status_check
  CHECK (status = ANY (ARRAY['pending','payment_reported','approved','rejected','cancelled']::text[]));

-- Privileged implementations live in the non-exposed private schema.
CREATE OR REPLACE FUNCTION private.spike_cancel_my_coin_order(p_order_id uuid,p_confirm_no_transfer boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order public.coin_orders; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501'; END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Purchase request is required'; END IF;
  SELECT * INTO v_order FROM public.coin_orders WHERE id=p_order_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found'; END IF;
  IF v_order.status NOT IN ('pending','payment_reported') THEN RAISE EXCEPTION 'Only pending or payment-reported requests can be cancelled'; END IF;
  IF v_order.status='payment_reported' AND coalesce(p_confirm_no_transfer,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirm that no bank transfer was made before cancelling this reported payment';
  END IF;
  UPDATE public.coin_orders SET status='cancelled',cancelled_at=now(),cancelled_by=v_uid,
    cancellation_reason=CASE WHEN v_order.status='payment_reported' THEN 'Requester cancelled after confirming no bank transfer was made' ELSE 'Cancelled by requester' END,
    updated_at=now() WHERE id=v_order.id;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_uid,'coin_order_cancelled',
    jsonb_build_object('emoji','🪙','reference',v_order.reference,'reason',CASE WHEN v_order.status='payment_reported' THEN 'Requester confirmed no bank transfer was made' ELSE 'Cancelled by requester' END),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(v_uid,'coin_order_cancelled_by_requester',v_uid,'user',
    jsonb_build_object('order_id',v_order.id,'reference',v_order.reference,'previous_status',v_order.status));
  RETURN jsonb_build_object('ok',true,'status','cancelled','reference',v_order.reference);
END; $$;

CREATE OR REPLACE FUNCTION private.admin_cancel_coin_order(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order public.coin_orders; v_reason text := nullif(left(trim(coalesce(p_reason,'')),500),'');
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_order_id IS NULL OR v_reason IS NULL THEN RAISE EXCEPTION 'Purchase request and cancellation reason are required'; END IF;
  SELECT * INTO v_order FROM public.coin_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase request not found'; END IF;
  IF v_order.status NOT IN ('pending','payment_reported') THEN RAISE EXCEPTION 'Only pending or payment-reported requests can be cancelled'; END IF;
  UPDATE public.coin_orders SET status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=v_reason,updated_at=now() WHERE id=v_order.id;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(v_order.user_id,'coin_order_cancelled',
    jsonb_build_object('emoji','🪙','reference',v_order.reference,'reason',v_reason,'cancelled_by','SPIKE Owner'),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'coin_order_cancelled_by_owner',v_order.user_id,'owner',
    jsonb_build_object('order_id',v_order.id,'reference',v_order.reference,'previous_status',v_order.status,'reason',v_reason));
  RETURN jsonb_build_object('ok',true,'status','cancelled','reference',v_order.reference);
END; $$;

-- Public API wrappers are SECURITY INVOKER; authorization and writes remain private.
CREATE OR REPLACE FUNCTION public.spike_cancel_my_coin_order(p_order_id uuid,p_confirm_no_transfer boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.spike_cancel_my_coin_order(p_order_id,p_confirm_no_transfer);
$$;
CREATE OR REPLACE FUNCTION public.admin_cancel_coin_order(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.admin_cancel_coin_order(p_order_id,p_reason);
$$;

REVOKE ALL ON FUNCTION public.spike_cancel_my_coin_order(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_cancel_my_coin_order(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_coin_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_coin_order(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION private.spike_cancel_my_coin_order(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.spike_cancel_my_coin_order(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION private.admin_cancel_coin_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_cancel_coin_order(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_coin_orders(p_status text DEFAULT NULL)
RETURNS SETOF public.coin_orders LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','payment_reported','approved','rejected','cancelled') THEN RAISE EXCEPTION 'Invalid order status'; END IF;
  RETURN QUERY SELECT o.* FROM public.coin_orders o WHERE p_status IS NULL OR o.status=p_status ORDER BY o.created_at DESC LIMIT 500;
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_coin_orders(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_coin_orders(text) TO authenticated;
COMMIT;
