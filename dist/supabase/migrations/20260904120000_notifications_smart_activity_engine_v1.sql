-- SPIKE Smart Activity + private Realtime notification backend.
-- Applied to production Supabase project cjqpyndceqyqsijihxbb.
-- This migration is a local reproducibility copy of the production changes.

create or replace function public.get_smart_notification_page(
  p_limit integer default 40,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table(id uuid,user_id uuid,type text,data jsonb,read boolean,created_at timestamptz,priority text,event_key text,group_key text,expires_at timestamptz,smart_score integer,smart_rank bigint,group_count bigint,smart_bucket text,smart_reason text)
language sql stable security invoker set search_path = public, pg_temp as $$
with base as (
 select n.*,coalesce(n.data->>'actor_id',n.data->>'from_user_id',n.data->>'sender_id',n.data->>'caller_id')::uuid actor_id
 from public.notifications n where n.user_id=(select auth.uid()) and (n.expires_at is null or n.expires_at>now())
 and (p_before_created_at is null or n.created_at<p_before_created_at or (n.created_at=p_before_created_at and n.id<p_before_id))
), enriched as (
 select b.*,exists(select 1 from public.friendships f where f.user_id=(select auth.uid()) and f.friend_id=b.actor_id) or exists(select 1 from public.friendships f where f.user_id=b.actor_id and f.friend_id=(select auth.uid())) is_friend,
 count(*) over(partition by coalesce(b.group_key,b.event_key,b.id::text)) grp_count from base b
), scored as (
 select e.*,least(100,greatest(0,
 case e.priority when 'critical' then 100 when 'high' then 88 when 'normal' then 60 when 'low' then 35 else 50 end
 +case when not e.read then 10 else 0 end+case when e.is_friend then 8 else 0 end
 +case when lower(e.type) like '%call%' or lower(e.type) like '%friend_request%' or lower(e.type) like '%message%' then 8 else 0 end
 +case when e.grp_count>1 then least(8,e.grp_count::integer-1) else 0 end
 +greatest(0,least(12,floor(extract(epoch from(now()-e.created_at))/60.0)::integer*-1+12))
 ))::integer score from enriched e
), ranked as (select s.*,row_number() over(order by s.score desc,s.created_at desc,s.id desc) rnk from scored s)
select r.id,r.user_id,r.type,r.data,r.read,r.created_at,r.priority,r.event_key,r.group_key,r.expires_at,r.score,r.rnk,r.grp_count,
case when r.score>=90 then 'immediate' when r.score>=75 then 'important' when r.score>=50 then 'normal' else 'low' end,
case when not r.read and (lower(r.type) like '%call%' or lower(r.type) like '%message%' or lower(r.type) like '%friend_request%') then 'Needs your attention'
when not r.read and r.is_friend then 'From someone you are connected with' when r.grp_count>1 then 'Grouped with related activity' when r.priority='critical' then 'Critical activity' when r.priority='high' then 'High-priority activity' else 'Recent activity' end
from ranked r order by r.score desc,r.created_at desc,r.id desc limit least(greatest(coalesce(p_limit,40),1),100);
$$;
revoke all on function public.get_smart_notification_page(integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_smart_notification_page(integer,timestamptz,uuid) to authenticated;

create index if not exists notifications_user_group_created_idx on public.notifications(user_id,group_key,created_at desc,id desc);
create index if not exists notifications_user_priority_created_idx on public.notifications(user_id,priority,created_at desc,id desc);
create index if not exists notifications_user_type_created_idx on public.notifications(user_id,type,created_at desc,id desc);

create or replace function public.broadcast_notification_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid; v_event text; begin v_user_id:=coalesce(new.user_id,old.user_id); if v_user_id is null then return coalesce(new,old); end if;
v_event:=case when tg_op='INSERT' then 'notification_created' when tg_op='UPDATE' then 'notification_updated' else 'notification_deleted' end;
perform realtime.send(jsonb_build_object('notification_id',coalesce(new.id,old.id),'operation',tg_op),v_event,'user:'||v_user_id::text||':notifications',true); return coalesce(new,old); end; $$;
revoke all on function public.broadcast_notification_change() from public,anon,authenticated;
grant execute on function public.broadcast_notification_change() to postgres,service_role;
drop trigger if exists notifications_realtime_broadcast on public.notifications;
create trigger notifications_realtime_broadcast after insert or update or delete on public.notifications for each row execute function public.broadcast_notification_change();
drop policy if exists "spike users can receive notification broadcasts" on realtime.messages;
create policy "spike users can receive notification broadcasts" on realtime.messages for select to authenticated using(topic like 'user:%:notifications' and split_part(topic,':',2)=(select auth.uid())::text);
