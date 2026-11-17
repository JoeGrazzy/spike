-- Fix the admin verification queue's declared text return type.
-- auth.users.email is varchar(255), so cast it explicitly to text.
CREATE OR REPLACE FUNCTION public.admin_list_identity_applications(p_status text DEFAULT NULL,p_search text DEFAULT NULL)
RETURNS TABLE(user_id uuid,sp_id text,display_name text,username text,email text,identity_status text,reason text,submitted_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,verified boolean,duplicate_matches integer,processing_seconds bigint,review_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('all','pending','approved','rejected','revoked','resubmission_required') THEN RAISE EXCEPTION 'Invalid identity queue'; END IF;
  RETURN QUERY
  SELECT i.user_id,p.sp_id,p.display_name,p.username,u.email::text,i.status,i.reason,i.submitted_at,i.reviewed_at,i.reviewed_by,p.verified,
    ((SELECT count(*) FROM public.profiles p2 WHERE p2.id<>p.id AND p.sp_id IS NOT NULL AND lower(p2.sp_id)=lower(p.sp_id)) +
     (SELECT count(*) FROM auth.users u2 WHERE u2.id<>u.id AND lower(coalesce(u2.email,''))=lower(coalesce(u.email,''))))::integer,
    CASE WHEN i.reviewed_at IS NOT NULL THEN greatest(0,extract(epoch FROM (i.reviewed_at-i.submitted_at))::bigint) ELSE NULL END,i.review_count
  FROM private.spike_verified_identities i JOIN auth.users u ON u.id=i.user_id LEFT JOIN public.profiles p ON p.id=i.user_id
  WHERE (p_status IS NULL OR p_status='all' OR i.status=p_status)
    AND (nullif(trim(coalesce(p_search,'')),'') IS NULL OR coalesce(p.display_name,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(p.username,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(p.sp_id,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(u.email,'') ILIKE '%'||trim(p_search)||'%')
  ORDER BY CASE i.status WHEN 'pending' THEN 0 WHEN 'resubmission_required' THEN 1 ELSE 2 END,i.submitted_at ASC LIMIT 500;
END; $$;
