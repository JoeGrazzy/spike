CREATE OR REPLACE FUNCTION private.admin_set_user_verified(p_target_user_id uuid,p_verified boolean)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','private'
AS $function$
DECLARE r public.profiles; actor_role text; previous boolean;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=auth.uid();
 IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
 IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'User ID required'; END IF;
 SELECT verified INTO previous FROM public.profiles WHERE id=p_target_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 UPDATE public.profiles SET verified=coalesce(p_verified,false),updated_at=now() WHERE id=p_target_user_id RETURNING * INTO r;
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details)
 VALUES(auth.uid(),CASE WHEN r.verified THEN 'grant_verified_badge' ELSE 'revoke_verified_badge' END,p_target_user_id,actor_role,jsonb_build_object('previous',coalesce(previous,false),'verified',r.verified));
 RETURN r;
END; $function$;
