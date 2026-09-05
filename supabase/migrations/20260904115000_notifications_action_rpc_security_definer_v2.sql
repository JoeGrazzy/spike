-- Notification mutation RPCs must not require direct table UPDATE/DELETE grants.
-- Keep the table closed to clients and perform ownership checks inside SECURITY DEFINER functions.

create or replace function public.clear_notifications()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_count integer;
begin
  delete from public.notifications where user_id = (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.delete_notification(p_notification_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_count integer;
begin
  delete from public.notifications
   where id = p_notification_id and user_id = (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

create or replace function public.delete_read_notifications()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_count integer;
begin
  delete from public.notifications
   where user_id = (select auth.uid()) and read = true;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_count integer;
begin
  update public.notifications set read = true
   where user_id = (select auth.uid()) and read = false;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_count integer;
begin
  update public.notifications set read = true
   where id = p_notification_id
     and user_id = (select auth.uid())
     and read = false;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

create or replace function public.set_notification_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if jsonb_typeof(coalesce(p_preferences,'{}'::jsonb)) <> 'object' then
    raise exception 'notification preferences must be a JSON object';
  end if;
  v := jsonb_build_object(
    'likes', coalesce((p_preferences->>'likes')::boolean, true),
    'comments', coalesce((p_preferences->>'comments')::boolean, true),
    'mentions', coalesce((p_preferences->>'mentions')::boolean, true),
    'follows', coalesce((p_preferences->>'follows')::boolean, true),
    'friend_requests', coalesce((p_preferences->>'friend_requests')::boolean, true),
    'messages', coalesce((p_preferences->>'messages')::boolean, true),
    'calls', coalesce((p_preferences->>'calls')::boolean, true),
    'rooms', coalesce((p_preferences->>'rooms')::boolean, true),
    'coins', coalesce((p_preferences->>'coins')::boolean, true),
    'purchases', coalesce((p_preferences->>'purchases')::boolean, true),
    'announcements', coalesce((p_preferences->>'announcements')::boolean, true),
    'system', coalesce((p_preferences->>'system')::boolean, true)
  );
  insert into public.user_app_settings(user_id, notification_preferences, updated_at)
  values ((select auth.uid()), v, now())
  on conflict (user_id) do update
    set notification_preferences = excluded.notification_preferences,
        updated_at = now();
  return v;
end; $$;

revoke all on function public.clear_notifications() from public, anon;
revoke all on function public.delete_notification(uuid) from public, anon;
revoke all on function public.delete_read_notifications() from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.set_notification_preferences(jsonb) from public, anon;
grant execute on function public.clear_notifications() to authenticated;
grant execute on function public.delete_notification(uuid) to authenticated;
grant execute on function public.delete_read_notifications() to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.set_notification_preferences(jsonb) to authenticated;
