BEGIN;

-- Remove the two confirmed redundant btree indexes; retain the older canonical names.
DROP INDEX IF EXISTS public.spike_live_audio_gift_transactions_broadcaster_created_idx;
DROP INDEX IF EXISTS public.spike_room_gift_transactions_receiver_created_idx;

-- Private admin helpers must never be callable by anon/PUBLIC. Keep authenticated
-- access where public SECURITY INVOKER wrappers depend on it.
REVOKE ALL ON FUNCTION private.admin_list_users(text,integer,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.admin_user_delete_preflight(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.admin_user_management_bundle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_list_users(text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_user_delete_preflight(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_user_management_bundle(uuid) TO authenticated;

-- Trigger-only functions are not RPC endpoints and need no client EXECUTE grants.
REVOKE ALL ON FUNCTION private.spike_log_verified_identity_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_protect_designated_owner_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_room_live_audio_end_on_broadcaster_leave() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.spike_room_live_audio_end_on_room_change() FROM PUBLIC, anon, authenticated;

-- Reject NULL/unknown decisions explicitly instead of allowing SQL three-valued
-- logic to fall through to the REVOKE branch.
CREATE OR REPLACE FUNCTION private.admin_review_verified_identity(
  p_user_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := nullif(left(trim(coalesce(p_reason,'')),500),'');
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN
    RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve','reject','revoke') THEN
    RAISE EXCEPTION 'Invalid identity decision' USING errcode='22023';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'SPIKE user not found' USING errcode='22023';
  END IF;
  IF p_decision IN ('reject','revoke') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required' USING errcode='22023';
  END IF;
  v_status := CASE p_decision WHEN 'approve' THEN 'approved'
                              WHEN 'reject' THEN 'rejected'
                              ELSE 'revoked' END;
  INSERT INTO private.spike_verified_identities
    (user_id,status,reviewed_by,reviewed_at,reason,updated_at)
  VALUES
    (p_user_id,v_status,auth.uid(),now(),v_reason,now())
  ON CONFLICT(user_id) DO UPDATE
    SET status=excluded.status,
        reviewed_by=excluded.reviewed_by,
        reviewed_at=excluded.reviewed_at,
        reason=excluded.reason,
        updated_at=now();

  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
  VALUES(auth.uid(),'verified_identity_'||p_decision,p_user_id,'owner',
         jsonb_build_object('reason',v_reason,'badge_entitlement_unchanged',true));

  RETURN jsonb_build_object('ok',true,'identity_status',v_status,
                            'badge_entitlement_unchanged',true);
END;
$$;

-- Reassert the intended browser-facing contract on the public wrapper.
REVOKE ALL ON FUNCTION public.admin_review_verified_identity(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verified_identity(uuid,text,text) TO authenticated;

COMMIT;
