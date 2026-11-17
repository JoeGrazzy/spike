CREATE OR REPLACE FUNCTION public.admin_guard()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT private.spike_is_owner(); $function$;

CREATE OR REPLACE FUNCTION public.admin_is_super_admin_self()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT private.spike_is_owner(); $function$;

CREATE OR REPLACE FUNCTION private.spike_is_policy_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT private.spike_is_owner(); $function$;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_user_id uuid, p_days integer, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog','public','auth','private'
AS $function$
DECLARE actor uuid:=auth.uid(); actor_role text; target_role text; until_at timestamptz; reason text:=nullif(trim(p_reason),'');
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor;
 IF actor IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
 IF p_user_id=actor THEN RAISE EXCEPTION 'You cannot restrict your own account'; END IF;
 IF p_days IS NULL OR p_days<0 OR p_days>3650 THEN RAISE EXCEPTION 'Ban duration must be 0 to 3650 days'; END IF;
 SELECT role INTO target_role FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF target_role IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 IF target_role IN ('admin','super_admin') AND actor_role<>'super_admin' THEN RAISE EXCEPTION 'Only a super admin can restrict an admin'; END IF;
 until_at:=CASE WHEN p_days=0 THEN NULL ELSE now()+make_interval(days=>p_days) END;
 UPDATE public.profiles SET restricted_until=until_at,restricted_at=now(),restricted_by=actor,restriction_reason=reason,updated_at=now() WHERE id=p_user_id;
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(actor,'user_banned',p_user_id,actor_role,jsonb_build_object('days',p_days,'restricted_until',until_at,'reason',reason));
 RETURN jsonb_build_object('ok',true,'restricted_until',until_at,'restricted_at',now(),'restricted_by',actor,'reason',reason,'permanent',(p_days=0));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','auth','private'
AS $function$
DECLARE actor uuid:=auth.uid(); actor_role text; target_role text; target_email text;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor;
 IF actor IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
 IF p_user_id=actor THEN RAISE EXCEPTION 'You cannot delete your own account'; END IF;
 SELECT p.role,u.email INTO target_role,target_email FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=p_user_id FOR UPDATE;
 IF target_role IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 IF target_role IN ('admin','super_admin') AND actor_role<>'super_admin' THEN RAISE EXCEPTION 'Only a super admin can delete an admin'; END IF;
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(actor,'user_deleted',p_user_id,actor_role,jsonb_build_object('email',target_email,'role',target_role));
 UPDATE public.announcements SET created_by=NULL WHERE created_by=p_user_id;
 DELETE FROM auth.users WHERE id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account deletion failed'; END IF;
 RETURN jsonb_build_object('ok',true,'deleted_user_id',p_user_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_unrestrict_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','auth','private'
AS $function$
DECLARE actor uuid:=auth.uid(); actor_role text; target_role text; changed boolean;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor;
 IF actor IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
 SELECT role INTO target_role FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF target_role IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 IF target_role IN ('admin','super_admin') AND actor_role<>'super_admin' THEN RAISE EXCEPTION 'Only a super admin can unrestrict an admin'; END IF;
 UPDATE public.profiles SET restricted_until=NULL,restricted_at=NULL,restricted_by=NULL,restriction_reason=NULL,updated_at=now() WHERE id=p_user_id AND restricted_at IS NOT NULL;
 changed:=FOUND;
 IF changed THEN INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(actor,'user_unrestricted',p_user_id,actor_role,'{}'::jsonb); END IF;
 RETURN jsonb_build_object('ok',true,'changed',changed,'status','active');
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_activation(p_user_id uuid,p_activated boolean,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_catalog','auth','private'
AS $function$
DECLARE actor uuid:=auth.uid(); actor_role text; old_state jsonb; new_state jsonb;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor;
 IF actor IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'User is required'; END IF;
 SELECT jsonb_build_object('activated',activated) INTO old_state FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF old_state IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 UPDATE public.profiles SET activated=coalesce(p_activated,false),updated_at=now() WHERE id=p_user_id;
 new_state:=jsonb_build_object('activated',coalesce(p_activated,false));
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(actor,'user_activation',p_user_id,actor_role,jsonb_build_object('reason',nullif(left(trim(coalesce(p_reason,'')),500),''),'before',old_state,'after',new_state));
 RETURN jsonb_build_object('ok',true,'user_id',p_user_id,'activated',coalesce(p_activated,false));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid,p_role text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_catalog','auth','private'
AS $function$
DECLARE r public.profiles; old_role text; actor_role text;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=auth.uid();
 IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required'; END IF;
 IF p_role NOT IN ('user','support_admin','content_admin','moderation_admin','admin','super_admin') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 SELECT role INTO old_role FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF old_role IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 IF p_user_id=auth.uid() AND p_role<>'super_admin' THEN RAISE EXCEPTION 'You cannot lower your own role'; END IF;
 IF actor_role<>'super_admin' AND (old_role IN ('admin','super_admin') OR p_role IN ('admin','super_admin')) THEN RAISE EXCEPTION 'Only a super admin can change administrator roles'; END IF;
 UPDATE public.profiles SET role=p_role,updated_at=now() WHERE id=p_user_id RETURNING * INTO r;
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'user_role_changed',p_user_id,actor_role,jsonb_build_object('previous_role',old_role,'new_role',p_role,'reason',nullif(left(trim(coalesce(p_reason,'')),500),'')));
 RETURN jsonb_build_object('ok',true,'user_id',p_user_id,'previous_role',old_role,'role',p_role);
END; $function$;

CREATE OR REPLACE FUNCTION private.admin_grant_role(p_target_user_id uuid,p_role text)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','private'
AS $function$
DECLARE r public.profiles; actor_role text;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=auth.uid();
 IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required'; END IF;
 IF p_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 UPDATE public.profiles SET role=p_role,updated_at=now() WHERE id=p_target_user_id RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'grant_role',p_target_user_id,p_role,jsonb_build_object('role',p_role));
 RETURN r;
END; $function$;

CREATE OR REPLACE FUNCTION private.admin_revoke_role(p_target_user_id uuid)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','private'
AS $function$
DECLARE r public.profiles; previous_role text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required'; END IF;
 SELECT role INTO previous_role FROM public.profiles WHERE id=p_target_user_id FOR UPDATE;
 IF previous_role IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 IF p_target_user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot revoke your own admin access'; END IF;
 UPDATE public.profiles SET role='user',updated_at=now() WHERE id=p_target_user_id RETURNING * INTO r;
 INSERT INTO public.admin_audit(actor_id,action,target_user_id,role,details) VALUES(auth.uid(),'revoke_role',p_target_user_id,'user',jsonb_build_object('previous_role',previous_role,'new_role','user'));
 RETURN r;
END; $function$;
