-- SPIKE DM presence timestamps: persist last activity while honoring profile privacy.
-- Realtime Presence remains the source of immediate online state; this table backs last-seen.

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.user_presence add column if not exists last_seen timestamptz not null default now();
alter table public.user_presence add column if not exists updated_at timestamptz not null default now();
alter table public.user_presence add column if not exists current_page text;

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from public, anon, authenticated;
drop policy if exists user_presence_own on public.user_presence;

create or replace function public.touch_user_presence(p_user_id uuid default null, p_current_page text default null)
returns public.user_presence
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_row public.user_presence;
begin
  if v_uid is null or v_uid <> auth.uid() then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  insert into public.user_presence(user_id,last_seen,updated_at,current_page)
  values (v_uid, clock_timestamp(), clock_timestamp(), nullif(left(coalesce(p_current_page,''),500),''))
  on conflict (user_id) do update set
    last_seen = excluded.last_seen,
    updated_at = excluded.updated_at,
    current_page = coalesce(excluded.current_page, public.user_presence.current_page)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.touch_user_presence(uuid,text) from public, anon;
grant execute on function public.touch_user_presence(uuid,text) to authenticated;

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

comment on function public.touch_user_presence(uuid,text) is 'Updates only the authenticated user last-seen timestamp for SPIKE presence.';
comment on function public.spike_get_user_presence(uuid[]) is 'Returns presence only for users who allow online-status visibility; max 100 user IDs.';
