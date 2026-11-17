BEGIN;
ALTER TABLE private.spike_verified_identities
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS resubmission_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;
UPDATE private.spike_verified_identities i
SET submitted_at = coalesce((SELECT min(s.created_at) FROM private.spike_verified_subscriptions s WHERE s.user_id=i.user_id),i.updated_at,now())
WHERE submitted_at IS NULL;
ALTER TABLE private.spike_verified_identities ALTER COLUMN submitted_at SET DEFAULT now();
ALTER TABLE private.spike_verified_identities ALTER COLUMN submitted_at SET NOT NULL;
ALTER TABLE private.spike_verified_identities DROP CONSTRAINT IF EXISTS spike_verified_identities_status_check;
ALTER TABLE private.spike_verified_identities ADD CONSTRAINT spike_verified_identities_status_check
  CHECK (status IN ('pending','approved','rejected','revoked','resubmission_required'));

CREATE TABLE IF NOT EXISTS private.spike_verified_identity_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processing_seconds bigint
);
CREATE INDEX IF NOT EXISTS spike_verified_identity_history_user_idx
  ON private.spike_verified_identity_history(user_id,created_at DESC);
ALTER TABLE private.spike_verified_identity_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.spike_verified_identity_history FROM PUBLIC,anon,authenticated;
REVOKE ALL ON private.spike_verified_identities FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.spike_log_verified_identity_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_from text; v_actor uuid; v_submitted timestamptz;
BEGIN
  v_from := CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END;
  v_actor := coalesce(auth.uid(),NEW.reviewed_by);
  v_submitted := coalesce(NEW.submitted_at,NEW.updated_at,now());
  IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.reason IS DISTINCT FROM NEW.reason THEN
    INSERT INTO private.spike_verified_identity_history(user_id,from_status,to_status,reason,actor_id,processing_seconds)
    VALUES(NEW.user_id,v_from,NEW.status,NEW.reason,v_actor,
      CASE WHEN NEW.reviewed_at IS NOT NULL THEN greatest(0,extract(epoch FROM (NEW.reviewed_at-v_submitted))::bigint) ELSE NULL END);
    IF TG_OP='UPDATE' THEN NEW.review_count := coalesce(OLD.review_count,0)+1; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS spike_verified_identity_history_trg ON private.spike_verified_identities;
CREATE TRIGGER spike_verified_identity_history_trg
BEFORE INSERT OR UPDATE ON private.spike_verified_identities
FOR EACH ROW EXECUTE FUNCTION private.spike_log_verified_identity_history();

CREATE OR REPLACE FUNCTION public.admin_list_identity_applications(p_status text DEFAULT NULL,p_search text DEFAULT NULL)
RETURNS TABLE(user_id uuid,sp_id text,display_name text,username text,email text,identity_status text,reason text,submitted_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,verified boolean,duplicate_matches integer,processing_seconds bigint,review_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('all','pending','approved','rejected','revoked','resubmission_required') THEN RAISE EXCEPTION 'Invalid identity queue'; END IF;
  RETURN QUERY
  SELECT i.user_id,p.sp_id,p.display_name,p.username,u.email,i.status,i.reason,i.submitted_at,i.reviewed_at,i.reviewed_by,p.verified,
    ((SELECT count(*) FROM public.profiles p2 WHERE p2.id<>p.id AND p.sp_id IS NOT NULL AND lower(p2.sp_id)=lower(p.sp_id)) +
     (SELECT count(*) FROM auth.users u2 WHERE u2.id<>u.id AND lower(coalesce(u2.email,''))=lower(coalesce(u.email,''))))::integer,
    CASE WHEN i.reviewed_at IS NOT NULL THEN greatest(0,extract(epoch FROM (i.reviewed_at-i.submitted_at))::bigint) ELSE NULL END,i.review_count
  FROM private.spike_verified_identities i JOIN auth.users u ON u.id=i.user_id LEFT JOIN public.profiles p ON p.id=i.user_id
  WHERE (p_status IS NULL OR p_status='all' OR i.status=p_status)
    AND (nullif(trim(coalesce(p_search,'')),'') IS NULL OR coalesce(p.display_name,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(p.username,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(p.sp_id,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(u.email,'') ILIKE '%'||trim(p_search)||'%')
  ORDER BY CASE i.status WHEN 'pending' THEN 0 WHEN 'resubmission_required' THEN 1 ELSE 2 END,i.submitted_at ASC LIMIT 500;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_identity_history(p_user_id uuid)
RETURNS TABLE(id uuid,from_status text,to_status text,reason text,actor_id uuid,actor_name text,created_at timestamptz,processing_seconds bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  RETURN QUERY SELECT h.id,h.from_status,h.to_status,h.reason,h.actor_id,coalesce(ap.display_name,ap.username,'SPIKE Admin'),h.created_at,h.processing_seconds
  FROM private.spike_verified_identity_history h LEFT JOIN public.profiles ap ON ap.id=h.actor_id
  WHERE h.user_id=p_user_id ORDER BY h.created_at DESC LIMIT 100;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_request_identity_resubmission(p_user_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_reason text:=nullif(left(trim(coalesce(p_reason,'')),500),'');
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A resubmission reason is required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'SPIKE user not found'; END IF;
  INSERT INTO private.spike_verified_identities(user_id,status,reason,reviewed_by,reviewed_at,submitted_at,resubmission_requested_at,updated_at)
  VALUES(p_user_id,'resubmission_required',v_reason,auth.uid(),now(),now(),now(),now())
  ON CONFLICT(user_id) DO UPDATE SET status='resubmission_required',reason=excluded.reason,reviewed_by=auth.uid(),reviewed_at=now(),resubmission_requested_at=now(),updated_at=now();
  INSERT INTO public.notifications(user_id,type,data,priority) VALUES(p_user_id,'verified_identity_resubmission_requested',jsonb_build_object('reason',v_reason,'message','SPIKE needs you to resubmit your identity verification information.'),'high');
  INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'verified_identity_resubmission_requested',p_user_id,'owner',jsonb_build_object('reason',v_reason));
  RETURN jsonb_build_object('ok',true,'identity_status','resubmission_required');
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_identity_applications(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_identity_history(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_request_identity_resubmission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_identity_applications(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_identity_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_request_identity_resubmission(uuid,text) TO authenticated;
COMMIT;
