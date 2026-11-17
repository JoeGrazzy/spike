BEGIN;
CREATE OR REPLACE FUNCTION private.admin_revoke_verified_subscription(p_subscription_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_sub private.spike_verified_subscriptions; v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),'');
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A revocation reason is required'; END IF;
  SELECT * INTO v_sub FROM private.spike_verified_subscriptions WHERE id=p_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.status NOT IN ('active','awaiting_identity') THEN RAISE EXCEPTION 'Active or awaiting-identity subscription not found'; END IF;
  UPDATE private.spike_verified_subscriptions SET status='revoked',payment_rejection_reason=v_reason,decided_by=auth.uid(),decided_at=now(),updated_at=now()
  WHERE user_id=v_sub.user_id AND status IN ('active','awaiting_identity');
  INSERT INTO private.spike_verified_identities(user_id,status,reviewed_by,reviewed_at,reason,updated_at)
  VALUES(v_sub.user_id,'revoked',auth.uid(),now(),v_reason,now())
  ON CONFLICT(user_id) DO UPDATE SET status='revoked',reviewed_by=auth.uid(),reviewed_at=now(),reason=v_reason,updated_at=now();
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_sub.user_id,'verified_subscription_revoked',jsonb_build_object('reference',v_sub.reference,'reason',v_reason),'normal');
  INSERT INTO public.notifications(user_id,type,data,priority)
  VALUES(v_sub.user_id,'verified_identity_revoked',jsonb_build_object('reason',v_reason,'message','Your SPIKE identity verification was revoked. Reason: '||v_reason),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'verified_subscription_revoked',v_sub.user_id,'owner',jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'reason',v_reason,'all_active_subscriptions_revoked',true));
  RETURN jsonb_build_object('ok',true,'status','revoked','identity_status','revoked');
END; $$;
COMMIT;
