-- Distinguish an explicitly admin-suspended account from profiles that simply have not been activated yet.
create or replace function public.admin_list_users_v2(p_search text default '',p_limit integer default 100,p_offset integer default 0,p_filter text default 'all')
returns table(user_id uuid,email text,display_name text,username text,sp_id text,coins bigint,created_at timestamptz,room_count bigint,is_admin boolean,status text,banned_until timestamptz,banned_at timestamptz,banned_by uuid,ban_reason text,last_seen_at timestamptz,providers text[],verified boolean,activated boolean)
language sql stable security definer set search_path='public','auth'
as $function$
 select u.id,u.email,coalesce(p.display_name,u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name'),p.username,p.sp_id,coalesce(w.balance,0)::bigint,coalesce(p.created_at,u.created_at),0::bigint,coalesce(p.role in ('admin','super_admin'),false),
 case when u.deleted_at is not null then 'deleted' when p.id is null then 'profile_missing' when p.restricted_at is not null and (p.restricted_until is null or p.restricted_until>now()) then 'banned' when activation.activated is false then 'inactive' when p.activated=false then 'pending_activation' else 'active' end,
 p.restricted_until,p.restricted_at,p.restricted_by,p.restriction_reason,(select up.last_seen from public.user_presence up where up.user_id=u.id),
 coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id=u.id),'{}'::text[]),coalesce(p.verified,false),coalesce(p.activated,true)
 from auth.users u left join public.profiles p on p.id=u.id left join public.wallets w on w.user_id=u.id
 left join lateral (select (a.details->'after'->>'activated')::boolean as activated from public.admin_audit a where a.target_user_id=u.id and a.action='user_activation' order by a.created_at desc,a.id desc limit 1) activation on true
 where public.admin_guard() and u.deleted_at is null
 and (coalesce(trim(p_search),'')='' or coalesce(p.display_name,'') ilike '%'||trim(p_search)||'%' or coalesce(p.username,'') ilike '%'||ltrim(trim(p_search),'@')||'%' or coalesce(p.sp_id,'') ilike '%'||trim(p_search)||'%' or coalesce(u.email,'') ilike '%'||trim(p_search)||'%' or u.id::text ilike '%'||trim(p_search)||'%' or exists(select 1 from auth.identities si where si.user_id=u.id and si.provider ilike '%'||trim(p_search)||'%'))
 and (coalesce(lower(p_filter),'all')='all' or (lower(p_filter)='active' and p.activated=true and not (p.restricted_at is not null and (p.restricted_until is null or p.restricted_until>now()))) or (lower(p_filter)='inactive' and activation.activated=false) or (lower(p_filter)='pending_activation' and p.activated=false and activation.activated is null) or (lower(p_filter)='banned' and p.restricted_at is not null and (p.restricted_until is null or p.restricted_until>now())) or (lower(p_filter)='verified' and p.verified=true) or (lower(p_filter)='unverified' and coalesce(p.verified,false)=false) or (lower(p_filter)='admin' and p.role in ('admin','super_admin')) or (lower(p_filter)='profile_missing' and p.id is null))
 order by coalesce(p.created_at,u.created_at) desc limit greatest(1,least(coalesce(p_limit,100),500)) offset greatest(0,coalesce(p_offset,0));
$function$;

do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 if position('account_suspended' in d)=0 then
  d:=replace(d,'  return coalesce(v_result,','  v_result:=jsonb_set(v_result,''{account_suspended}'',to_jsonb(coalesce((select (a.details->''after''->>''activated'')::boolean=false from public.admin_audit a where a.target_user_id=p_user_id and a.action=''user_activation'' order by a.created_at desc,a.id desc limit 1),false)),true);'||chr(10)||'  return coalesce(v_result,');
 end if;
 execute d;
end;
$block$;
