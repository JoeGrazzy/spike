create or replace function public.room_members_list(
  p_room_id uuid,
  p_search text default '',
  p_filter text default 'all',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  sp_id text,
  avatar_url text,
  role text,
  joined_at timestamptz,
  is_muted boolean,
  muted_until timestamptz,
  is_banned boolean,
  message_count_30d bigint,
  reactions_received_30d bigint,
  active_days_30d bigint,
  score numeric,
  label text
)
language sql
stable
security definer
set search_path = public
as $function$
with members as (
  select m.room_id,m.user_id,m.role,m.joined_at,
         p.display_name,p.username,p.sp_id,p.avatar_url
  from public.room_members m
  join public.profiles p on p.id=m.user_id
  where m.room_id=p_room_id and m.active=true
),
messages as (
  select rm.user_id,
         count(*)::bigint as message_count_30d,
         count(distinct (rm.created_at at time zone 'utc')::date)::bigint as active_days_30d
  from public.room_messages rm
  where rm.room_id=p_room_id and rm.created_at >= now()-interval '30 days'
  group by rm.user_id
),
reactions as (
  select rm.user_id,count(*)::bigint as reactions_received_30d
  from public.room_message_reactions rr
  join public.room_messages rm on rm.id=rr.message_id
  where rm.room_id=p_room_id and rr.created_at >= now()-interval '30 days'
  group by rm.user_id
),
ranked as (
  select m.*,
         (select count(*) from public.room_mutes mu where mu.room_id=p_room_id and mu.user_id=m.user_id and (mu.expires_at is null or mu.expires_at>now()))>0 as is_muted,
         (select max(mu.expires_at) from public.room_mutes mu where mu.room_id=p_room_id and mu.user_id=m.user_id and (mu.expires_at is null or mu.expires_at>now())) as muted_until,
         exists(select 1 from public.room_bans b where b.room_id=p_room_id and b.user_id=m.user_id) as is_banned,
         coalesce(ms.message_count_30d,0)::bigint as message_count_30d,
         coalesce(rx.reactions_received_30d,0)::bigint as reactions_received_30d,
         coalesce(ms.active_days_30d,0)::bigint as active_days_30d,
         round((least(50,ln(1+coalesce(ms.message_count_30d,0))*12)
           + least(30,ln(1+coalesce(rx.reactions_received_30d,0))*8)
           + least(20,ln(1+coalesce(ms.active_days_30d,0))*6))::numeric,1) as score
  from members m
  left join messages ms on ms.user_id=m.user_id
  left join reactions rx on rx.user_id=m.user_id
),
final as (
  select r.*,
    case when r.score>=70 then 'Top contributor'
         when r.score>=45 then 'Strong contributor'
         when r.active_days_30d>=5 then 'Consistent member'
         else 'Member' end as label
  from ranked r
)
select f.user_id,f.display_name,f.username,f.sp_id,f.avatar_url,f.role,f.joined_at,
       f.is_muted,f.muted_until,f.is_banned,f.message_count_30d,f.reactions_received_30d,f.active_days_30d,f.score,f.label
from final f
where public.room_staff(p_room_id)
  and (coalesce(trim(p_search),'')='' or f.display_name ilike '%'||trim(p_search)||'%' or f.username ilike '%'||ltrim(trim(p_search),'@')||'%' or f.sp_id ilike '%'||trim(p_search)||'%')
  and (coalesce(p_filter,'all')='all'
       or (p_filter='moderators' and f.role in ('owner','admin','moderator'))
       or (p_filter='muted' and f.is_muted))
order by case when f.role='owner' then 0 when f.role='admin' then 1 when f.role='moderator' then 2 else 3 end,
         f.score desc, f.joined_at desc
limit greatest(1,least(coalesce(p_limit,100),200))
offset greatest(0,coalesce(p_offset,0));
$function$;

create or replace function public.room_member_set_role(p_room_id uuid,p_user_id uuid,p_role text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare actor_role text; target_role text; owner_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.owner_id into owner_id from public.rooms r where r.id=p_room_id;
  select m.role into actor_role from public.room_members m where m.room_id=p_room_id and m.user_id=auth.uid();
  if auth.uid()<>owner_id and actor_role not in ('owner','admin') then raise exception 'Only the room owner or admin can change roles'; end if;
  if p_role not in ('member','moderator') then raise exception 'Invalid room role'; end if;
  if p_user_id=owner_id then raise exception 'The room owner role cannot be changed here'; end if;
  select m.role into target_role from public.room_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.active=true;
  if target_role is null then raise exception 'Member not found'; end if;
  update public.room_members set role=p_role where room_id=p_room_id and user_id=p_user_id;
  insert into public.room_moderation_actions(room_id,moderator_id,target_user_id,action,reason)
  values(p_room_id,auth.uid(),p_user_id,'role_change','Changed role to '||p_role);
  return jsonb_build_object('ok',true,'role',p_role);
end;
$function$;

create or replace function public.room_moderation_unmute(p_room_id uuid,p_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
begin
  if not public.room_staff(p_room_id) then raise exception 'Not authorized'; end if;
  delete from public.room_mutes where room_id=p_room_id and user_id=p_user_id;
  insert into public.room_moderation_actions(room_id,moderator_id,target_user_id,action,reason)
  values(p_room_id,auth.uid(),p_user_id,'unmute',p_reason);
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.room_moderation_unban(p_room_id uuid,p_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
begin
  if not public.room_staff(p_room_id) then raise exception 'Not authorized'; end if;
  delete from public.room_bans where room_id=p_room_id and user_id=p_user_id;
  insert into public.room_moderation_actions(room_id,moderator_id,target_user_id,action,reason)
  values(p_room_id,auth.uid(),p_user_id,'unban',p_reason);
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.room_member_history(p_room_id uuid,p_user_id uuid,p_limit integer default 20)
returns table(action text,duration_seconds integer,reason text,created_at timestamptz,moderator_id uuid)
language sql stable security definer set search_path=public
as $function$
select a.action,a.duration_seconds,a.reason,a.created_at,a.moderator_id
from public.room_moderation_actions a
where public.room_staff(p_room_id) and a.room_id=p_room_id and a.target_user_id=p_user_id
order by a.created_at desc
limit greatest(1,least(coalesce(p_limit,20),100));
$function$;

create or replace function public.room_member_rankings(p_room_id uuid,p_limit integer default 5)
returns table(user_id uuid,display_name text,username text,avatar_url text,score numeric,label text,message_count_30d bigint,reactions_received_30d bigint,active_days_30d bigint)
language sql stable security definer set search_path=public
as $function$
select x.user_id,x.display_name,x.username,x.avatar_url,x.score,x.label,x.message_count_30d,x.reactions_received_30d,x.active_days_30d
from public.room_members_list(p_room_id,'','all',200,0) x
where x.role <> 'owner'
order by x.score desc,x.active_days_30d desc,x.message_count_30d desc
limit greatest(1,least(coalesce(p_limit,5),10));
$function$;
