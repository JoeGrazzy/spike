BEGIN;
CREATE OR REPLACE FUNCTION public.admin_creator_review_eligibility(p_user_id uuid,p_status text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),''); v_message text; v_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_status NOT IN ('under_review','eligible','ineligible','suspended') THEN RAISE EXCEPTION 'Invalid eligibility status'; END IF;
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'SPIKE user not found'; END IF;
  IF p_status IN ('ineligible','suspended') AND v_reason IS NULL THEN RAISE EXCEPTION 'A reason is required for ineligible or suspended decisions'; END IF;
  IF p_status='eligible' AND private.spike_user_is_restricted(p_user_id) THEN RAISE EXCEPTION 'A restricted SPIKE account cannot be approved for earnings eligibility'; END IF;
  INSERT INTO public.spike_creator_eligibility(user_id,status,reviewed_by,reviewed_at,reason,updated_at)
  VALUES(p_user_id,p_status,auth.uid(),now(),v_reason,now())
  ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,reason=excluded.reason,updated_at=now();
  v_type:=CASE p_status WHEN 'eligible' THEN 'creator_eligibility_approved' WHEN 'ineligible' THEN 'creator_eligibility_rejected' WHEN 'suspended' THEN 'creator_eligibility_suspended' ELSE 'creator_eligibility_under_review' END;
  v_message:=CASE p_status WHEN 'eligible' THEN 'Your SPIKE earnings eligibility has been approved.' WHEN 'ineligible' THEN 'Your SPIKE earnings eligibility was not approved. Reason: '||coalesce(v_reason,'Not provided') WHEN 'suspended' THEN 'Your SPIKE earnings eligibility has been suspended. Reason: '||coalesce(v_reason,'Not provided') ELSE 'Your SPIKE earnings eligibility is under review.' END;
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(p_user_id,v_type,jsonb_build_object('status',p_status,'reason',v_reason,'message',v_message),'normal');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'creator_eligibility_reviewed',p_user_id,'owner',jsonb_build_object('status',p_status,'reason',v_reason));
  RETURN jsonb_build_object('ok',true,'status',p_status);
END; $$;
COMMIT;
