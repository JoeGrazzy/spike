-- SPIKE Admin Control Center v2: close privileged UI contract gaps without
-- granting browser access to server-owned tables.

create or replace function public.admin_set_user_verified(p_user_id uuid,p_verified boolean,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); old_state jsonb; new_state jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  if p_user_id is null then raise exception 'User is required'; end if;
  select jsonb_build_object('verified',verified) into old_state from public.profiles where id=p_user_id for update;
  if old_state is null then raise exception 'SPIKE user not found'; end if;
  update public.profiles set verified=coalesce(p_verified,false),updated_at=now() where id=p_user_id;
  new_state=jsonb_build_object('verified',coalesce(p_verified,false));
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,reason,before_state,after_state)
  values(actor,'user_verification','user',p_user_id,left(nullif(btrim(coalesce(p_reason,'')),''),500),old_state,new_state);
  return jsonb_build_object('ok',true,'user_id',p_user_id,'verified',coalesce(p_verified,false));
end; $$;
revoke all on function public.admin_set_user_verified(uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_user_verified(uuid,boolean,text) to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid,p_role text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); old_role text; new_role text;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  if p_role is null or p_role not in ('user','admin','super_admin','content_admin','moderation_admin','support_admin') then raise exception 'Invalid administrator role'; end if;
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'SPIKE user not found'; end if;
  select coalesce(role,'user') into old_role from public.profiles where id=p_user_id for update;
  new_role:=p_role;
  if old_role='super_admin' and p_user_id=actor and new_role<>'super_admin' then raise exception 'Cannot remove your own super-admin role'; end if;
  update public.profiles set role=new_role,updated_at=now() where id=p_user_id;
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,reason,before_state,after_state)
  values(actor,'user_role_change','user',p_user_id,left(nullif(btrim(coalesce(p_reason,'')),''),500),jsonb_build_object('role',old_role),jsonb_build_object('role',new_role));
  return jsonb_build_object('ok',true,'user_id',p_user_id,'role',new_role);
end; $$;
revoke all on function public.admin_set_user_role(uuid,text,text) from public,anon;
grant execute on function public.admin_set_user_role(uuid,text,text) to authenticated;

create or replace function public.admin_announcement_list(p_status text default null,p_limit integer default 100)
returns table(id uuid,title text,body text,audience text,publish_at timestamptz,expires_at timestamptz,severity text,status text,delivered_count integer,created_by uuid,created_at timestamptz,updated_at timestamptz,cancelled_at timestamptz,pending_count bigint)
language sql security definer set search_path=public,pg_temp as $$
  select a.id,a.title,a.body,a.audience,a.publish_at,a.expires_at,a.severity,a.status,a.delivered_count,a.created_by,a.created_at,a.updated_at,a.cancelled_at,
         (select count(*) from public.spike_admin_announcement_recipients r where r.campaign_id=a.id and r.delivered_at is null) as pending_count
  from public.spike_admin_announcements a
  where public.is_super_admin(auth.uid())
    and (p_status is null or a.status=p_status)
  order by a.publish_at desc,a.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.admin_announcement_list(text,integer) from public,anon;
grant execute on function public.admin_announcement_list(text,integer) to authenticated;

create or replace function public.admin_announcement_update(
  p_id uuid,p_title text,p_body text,p_audience text,p_publish_at timestamptz,p_expires_at timestamptz,p_severity text,p_reason text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); old_state jsonb; new_state jsonb; current_status text;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  if length(btrim(coalesce(p_title,'')))<1 or length(p_title)>180 then raise exception 'Announcement title is required and must be <= 180 characters'; end if;
  if length(btrim(coalesce(p_body,'')))<1 or length(p_body)>5000 then raise exception 'Announcement body is required and must be <= 5000 characters'; end if;
  if p_audience not in ('all','verified','unverified') then raise exception 'Invalid announcement audience'; end if;
  if p_severity not in ('info','success','warning','critical') then raise exception 'Invalid announcement severity'; end if;
  if p_expires_at is not null and p_expires_at<=coalesce(p_publish_at,now()) then raise exception 'Expiration must be after publish time'; end if;
  select to_jsonb(a),a.status into old_state,current_status from public.spike_admin_announcements a where a.id=p_id for update;
  if old_state is null then raise exception 'Announcement not found'; end if;
  if current_status in ('completed','cancelled','expired') then raise exception 'Completed, cancelled or expired announcements cannot be edited'; end if;
  update public.spike_admin_announcements
     set title=btrim(p_title),body=btrim(p_body),audience=p_audience,publish_at=coalesce(p_publish_at,now()),expires_at=p_expires_at,severity=p_severity,
         status=case when p_expires_at is not null and p_expires_at<=now() then 'expired' when coalesce(p_publish_at,now())>now() then 'scheduled' else 'processing' end,updated_at=now()
   where id=p_id;
  select to_jsonb(a) into new_state from public.spike_admin_announcements a where a.id=p_id;
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,reason,before_state,after_state)
  values(actor,'announcement_update','announcement',p_id,left(nullif(btrim(coalesce(p_reason,'')),''),500),old_state,new_state);
  return jsonb_build_object('ok',true,'id',p_id);
end; $$;
revoke all on function public.admin_announcement_update(uuid,text,text,text,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.admin_announcement_update(uuid,text,text,text,timestamptz,timestamptz,text,text) to authenticated;
