begin;

alter table public.notifications
  add column if not exists priority text not null default 'normal',
  add column if not exists event_key text,
  add column if not exists group_key text,
  add column if not exists expires_at timestamptz;

alter table public.notifications drop constraint if exists notifications_priority_check;
alter table public.notifications add constraint notifications_priority_check check (priority in ('critical','high','normal','low'));

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc, id desc);
create index if not exists notifications_user_unread_created_idx on public.notifications (user_id, created_at desc, id desc) where read=false;
create unique index if not exists notifications_event_key_uidx on public.notifications (user_id,event_key) where event_key is not null;
create index if not exists notifications_user_group_idx on public.notifications (user_id,group_key,created_at desc) where group_key is not null;
create index if not exists notifications_expiry_idx on public.notifications (expires_at) where expires_at is not null;

create or replace function public.get_notification_page(p_limit integer default 40,p_before_created_at timestamptz default null,p_before_id uuid default null)
returns setof public.notifications language sql stable security invoker set search_path=public as $$
select n.* from public.notifications n where n.user_id=(select auth.uid()) and (n.expires_at is null or n.expires_at>now()) and (p_before_created_at is null or n.created_at<p_before_created_at or (n.created_at=p_before_created_at and n.id<p_before_id)) order by n.created_at desc,n.id desc limit least(greatest(coalesce(p_limit,40),1),100);
$$;

create or replace function public.get_notification_summary() returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object('unread',count(*) filter(where not read),'total',count(*),'critical',count(*) filter(where not read and priority='critical'),'high',count(*) filter(where not read and priority='high'),'activity',count(*) filter(where not read and type not ilike '%mention%' and type not ilike '%announcement%' and type not ilike '%system%' and type not ilike '%security%' and type not ilike '%auth%'),'mentions',count(*) filter(where not read and type ilike '%mention%'),'system',count(*) filter(where not read and (type ilike '%announcement%' or type='broadcast' or type ilike '%system%' or type ilike '%security%' or type ilike '%auth%'))) from public.notifications where user_id=(select auth.uid()) and (expires_at is null or expires_at>now());
$$;

create or replace function public.mark_notification_read(p_notification_id uuid) returns boolean language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin update public.notifications set read=true where id=p_notification_id and user_id=(select auth.uid()) and read=false; get diagnostics v_count=row_count; return v_count>0; end; $$;
create or replace function public.mark_all_notifications_read() returns integer language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin update public.notifications set read=true where user_id=(select auth.uid()) and read=false; get diagnostics v_count=row_count; return v_count; end; $$;
create or replace function public.delete_notification(p_notification_id uuid) returns boolean language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin delete from public.notifications where id=p_notification_id and user_id=(select auth.uid()); get diagnostics v_count=row_count; return v_count>0; end; $$;
create or replace function public.delete_read_notifications() returns integer language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin delete from public.notifications where user_id=(select auth.uid()) and read=true; get diagnostics v_count=row_count; return v_count; end; $$;
create or replace function public.clear_notifications() returns integer language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin delete from public.notifications where user_id=(select auth.uid()); get diagnostics v_count=row_count; return v_count; end; $$;

revoke execute on function public.get_notification_page(integer,timestamptz,uuid),public.get_notification_summary(),public.mark_notification_read(uuid),public.mark_all_notifications_read(),public.delete_notification(uuid),public.delete_read_notifications(),public.clear_notifications() from public,anon;
grant execute on function public.get_notification_page(integer,timestamptz,uuid),public.get_notification_summary(),public.mark_notification_read(uuid),public.mark_all_notifications_read(),public.delete_notification(uuid),public.delete_read_notifications(),public.clear_notifications() to authenticated;
commit;
