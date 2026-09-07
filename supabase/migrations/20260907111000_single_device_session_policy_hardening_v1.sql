drop policy if exists "spike_device_sessions_self_all" on public.spike_device_sessions;
drop policy if exists "spike_device_sessions_admin_select" on public.spike_device_sessions;
create policy "spike_device_sessions_self_select" on public.spike_device_sessions for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on table public.spike_device_sessions from authenticated;
revoke all on table public.spike_device_sessions from anon;
