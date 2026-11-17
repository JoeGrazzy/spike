BEGIN;
CREATE OR REPLACE FUNCTION public.admin_list_verified_subscriptions(p_status text DEFAULT NULL)
RETURNS TABLE(id uuid,user_id uuid,sp_id text,display_name text,username text,reference text,plan text,amount_minor bigint,currency text,payment_status text,payment_reference text,identity_status text,status text,starts_at timestamptz,expires_at timestamptz,created_at timestamptz,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  PERFORM private.spike_expire_verified_subscriptions();
  IF p_status IS NOT NULL AND p_status NOT IN ('pending_payment','payment_reported','awaiting_identity','active','expired','rejected','revoked','identity_review') THEN RAISE EXCEPTION 'Invalid subscription queue'; END IF;
  RETURN QUERY SELECT s.id,s.user_id,p.sp_id,p.display_name,p.username,s.reference,s.plan,s.amount_minor,s.currency,s.payment_status,s.payment_reference,
    coalesce(i.status,'pending'),s.status,s.starts_at,s.expires_at,s.created_at,coalesce(s.payment_rejection_reason,i.reason)
  FROM private.spike_verified_subscriptions s JOIN public.profiles p ON p.id=s.user_id
  LEFT JOIN private.spike_verified_identities i ON i.user_id=s.user_id
  WHERE p_status IS NULL OR (p_status='identity_review' AND coalesce(i.status,'pending')<>'approved' AND s.payment_status<>'rejected') OR (p_status<>'identity_review' AND s.status=p_status)
  ORDER BY s.created_at DESC LIMIT 500;
END; $$;
COMMIT;
