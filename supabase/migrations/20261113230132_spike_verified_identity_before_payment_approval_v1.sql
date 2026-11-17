BEGIN;
CREATE OR REPLACE FUNCTION private.admin_decide_verified_subscription_payment(p_subscription_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_sub private.spike_verified_subscriptions; v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),''); v_activation jsonb; v_identity private.spike_verified_identities;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Decision must be approve or reject'; END IF;
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.payment_status<>'payment_reported' THEN RAISE EXCEPTION 'Payment-reported subscription request not found'; END IF;
  IF p_decision='reject' AND v_reason IS NULL THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  IF p_decision='approve' THEN
    SELECT * INTO v_identity FROM private.spike_verified_identities WHERE user_id=v_sub.user_id;
    IF NOT FOUND OR v_identity.status<>'approved' THEN
      RAISE EXCEPTION 'Approve SPIKE identity review before verifying payment. Send bank-transfer instructions only after identity approval.';
    END IF;
    UPDATE private.spike_verified_subscriptions SET payment_status='approved',status='awaiting_identity',decided_by=auth.uid(),decided_at=now(),updated_at=now() WHERE id=v_sub.id;
    INSERT INTO public.notifications(user_id,type,data,priority)
    VALUES(v_sub.user_id,'verified_subscription_payment_approved',jsonb_build_object('reference',v_sub.reference,'message','Payment verified. Your SPIKE Verified subscription is being activated.'),'normal');
    v_activation:=private.spike_activate_verified_subscription(v_sub.id);
  ELSE
    UPDATE private.spike_verified_subscriptions SET payment_status='rejected',status='rejected',payment_rejection_reason=v_reason,decided_by=auth.uid(),decided_at=now(),updated_at=now() WHERE id=v_sub.id;
    INSERT INTO public.notifications(user_id,type,data,priority)
    VALUES(v_sub.user_id,'verified_subscription_payment_rejected',jsonb_build_object('reference',v_sub.reference,'reason',v_reason),'normal');
  END IF;
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'verified_subscription_payment_'||p_decision,v_sub.user_id,'owner',jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'reason',v_reason));
  RETURN jsonb_build_object('ok',true,'status',CASE WHEN p_decision='approve' THEN coalesce(v_activation->>'reason','awaiting_identity') ELSE 'rejected' END,'activation',v_activation);
END; $$;
COMMIT;
