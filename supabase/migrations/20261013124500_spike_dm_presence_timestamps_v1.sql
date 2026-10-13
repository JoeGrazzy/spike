-- SPIKE DM presence timestamps: persist last activity while honoring profile privacy.
-- Realtime Presence remains the source of immediate online state; this table backs last-seen.

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.user_presence add column if not exists last_seen timestamptz not null default now();
create unique index if not exists user_presence_user_id_uidx on public.user_presence(user_id);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from public, anon, authenticated;

create or replace function public.spike_touch_user_presence()
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user_id uuid := auth.uid(); v_last_seen timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  insert into public.user_presence(user_id,last_seen) values(v_user_id,v_last_seen)
  on conflict(user_id) do update set last_seen=excluded.last_seen;
  return v_last_seen;
end;
$$;
revoke all on function public.spike_touch_user_presence() from public, anon;
grant execute on function public.spike_touch_user_presence() to authenticated;

create or replace function public.spike_get_user_presence(p_user_ids uuid[])
returns table(user_id uuid, online boolean, last_seen timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select up.user_id, (up.last_seen >= now() - interval '90 seconds') as online, up.last_seen
  from public.user_presence up
  left join public.profile_privacy pp on pp.user_id=up.user_id
  where auth.uid() is not null
    and up.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and cardinality(coalesce(p_user_ids, '{}'::uuid[])) <= 100
    and coalesce(pp.show_online_status, true) is not false;
$$;
revoke all on function public.spike_get_user_presence(uuid[]) from public, anon;
grant execute on function public.spike_get_user_presence(uuid[]) to authenticated;

comment on function public.spike_touch_user_presence() is 'Updates only the authenticated user last-seen timestamp for SPIKE presence.';
comment on function public.spike_get_user_presence(uuid[]) is 'Returns presence only for users who allow online-status visibility; max 100 user IDs.';
