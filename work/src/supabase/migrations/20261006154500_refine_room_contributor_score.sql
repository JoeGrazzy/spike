create or replace function public.room_members_list(p_room_id uuid,p_search text default '',p_filter text default 'all',p_limit integer default 100,p_offset integer default 0)
returns table(user_id uuid,display_name text,username text,sp_id text,avatar_url text,role text,joined_at timestamptz,is_muted boolean,muted_until timestamptz,is_banned boolean,message_count_30d bigint,reactions_received_30d bigint,active_days_30d bigint,score numeric,label text)
language sql stable security definer set search_path=public as $function$
with members as (
 select m.room_id,m.user_id,m.role,m.joined_at,p.display_name,p.username,p.sp_id,p.avatar_url
 from public.room_members m join public.profiles p on p.id=m.user_id
 where m.room_id=p_room_id and m.active=true
), messages as (
 select rm.user_id,count(*)::bigint message_count_30d,count(distinct (rm.created_at at time zone 'utc')::date)::bigint active_days_30d
 from public.room_messages rm where rm.room_id=p_room_id and rm.created_at>=now()-interval '30 days' group by rm.user_id
), reactions as (
 select rm.user_id,count(distinct rr.message_id)::bigint reactions_received_30d
 from public.room_message_reactions rr join public.room_messages rm on rm.id=rr.message_id
 where rm.room_id=p_room_id and rr.created_at>=now()-interval '30 days' and rr.user_id<>rm.user_id group by rm.user_id
), ranked as (
 select m.*,
  exists(select 1 from public.room_mutes mu where mu.room_id=p_room_id and mu.user_id=m.user_id and (mu.expires_at is null or mu.expires_at>now())) is_muted,
  (select max(mu.expires_at) from public.room_mutes mu where mu.room_id=p_room_id and mu.user_id=m.user_id and (mu.expires_at is null or mu.expires_at>now())) muted_until,
  exists(select 1 from public.room_bans b where b.room_id=p_room_id and b.user_id=m.user_id) is_banned,
  coalesce(ms.message_count_30d,0)::bigint message_count_30d,coalesce(rx.reactions_received_30d,0)::bigint reactions_received_30d,coalesce(ms.active_days_30d,0)::bigint active_days_30d,
  round((least(50,ln(1+coalesce(ms.message_count_30d,0))*12)+least(30,ln(1+coalesce(rx.reactions_received_30d,0))*8)+least(20,ln(1+coalesce(ms.active_days_30d,0))*6))::numeric,1) score
 from members m left join messages ms on ms.user_id=m.user_id left join reactions rx on rx.user_id=m.user_id
), final as (
 select r.*,case when r.score>=70 then 'Top contributor' when r.score>=45 then 'Strong contributor' when r.active_days_30d>=5 then 'Consistent member' else 'Member' end label from ranked r
)
select f.user_id,f.display_name,f.username,f.sp_id,f.avatar_url,f.role,f.joined_at,f.is_muted,f.muted_until,f.is_banned,f.message_count_30d,f.reactions_received_30d,f.active_days_30d,f.score,f.label
from final f
where public.room_staff(p_room_id)
 and (coalesce(trim(p_search),'')='' or f.display_name ilike '%'||trim(p_search)||'%' or f.username ilike '%'||ltrim(trim(p_search),'@')||'%' or f.sp_id ilike '%'||trim(p_search)||'%')
 and (coalesce(p_filter,'all')='all' or (p_filter='moderators' and f.role in ('owner','admin','moderator')) or (p_filter='muted' and f.is_muted))
order by case when f.role='owner' then 0 when f.role='admin' then 1 when f.role='moderator' then 2 else 3 end,f.score desc,f.joined_at desc
limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(0,coalesce(p_offset,0));
$function$;
