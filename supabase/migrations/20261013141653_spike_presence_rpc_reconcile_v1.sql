-- Reconcile DM presence reads with the deployed authenticated touch RPC.
-- The touch_user_presence(uuid,text) writer is established by the prior base schema migration.
create or replace function public.spike_get_user_presence(p_user_ids uuid[])
returns table(user_id uuid, online boolean, last_seen timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select up.user_id,
         (up.last_seen >= now() - interval '90 seconds') as online,
         up.last_seen
  from public.user_presence up
  left join public.profile_privacy pp on pp.user_id = up.user_id
  where auth.uid() is not null
    and cardinality(coalesce(p_user_ids, '{}'::uuid[])) <= 100
    and up.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and coalesce(pp.show_online_status, true) is not false;
$$;

revoke all on function public.spike_get_user_presence(uuid[]) from public, anon;
grant execute on function public.spike_get_user_presence(uuid[]) to authenticated;

revoke all on table public.user_presence from public, anon, authenticated;
drop policy if exists user_presence_own on public.user_presence;
revoke all on function public.touch_user_presence(uuid, text) from public, anon;
grant execute on function public.touch_user_presence(uuid, text) to authenticated;

comment on table public.user_presence is 'Presence timestamps are accessed only through authenticated RPCs; direct browser table access is disabled.';
comment on function public.spike_get_user_presence(uuid[]) is 'Privacy-filtered last-seen lookup for at most 100 user IDs.';
