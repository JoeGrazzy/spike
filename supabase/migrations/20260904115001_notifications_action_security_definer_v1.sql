-- Keep notifications table direct UPDATE/DELETE privileges closed.
-- User actions go through ownership-checked SECURITY DEFINER RPCs.

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.notifications
     set read = true
   where id = p_notification_id
     and user_id = (select auth.uid())
     and read = false;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.notifications
     set read = true
   where user_id = (select auth.uid())
     and read = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.delete_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  delete from public.notifications
   where id = p_notification_id
     and user_id = (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.delete_read_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  delete from public.notifications
   where user_id = (select auth.uid())
     and read = true;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.clear_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  delete from public.notifications
   where user_id = (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
revoke all on function public.delete_notification(uuid) from public, anon;
grant execute on function public.delete_notification(uuid) to authenticated;
revoke all on function public.delete_read_notifications() from public, anon;
grant execute on function public.delete_read_notifications() to authenticated;
revoke all on function public.clear_notifications() from public, anon;
grant execute on function public.clear_notifications() to authenticated;
