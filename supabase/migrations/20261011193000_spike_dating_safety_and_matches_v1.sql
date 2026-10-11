-- SPIKE Dating safety primitives and privacy-preserving discovery RPC.
-- Apply only after the Dating profile/likes base migration has been installed.
create table if not exists public.dating_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint dating_no_self_block check (blocker_id <> blocked_id)
);
create table if not exists public.dating_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','fake_profile','underage_concern','inappropriate_content','other')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  constraint dating_no_self_report check (reporter_id <> reported_id)
);
create table if not exists public.dating_matches (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_low,user_high),
  check (user_low < user_high)
);
create index if not exists dating_matches_user_low_idx on public.dating_matches(user_low,created_at desc);
create index if not exists dating_matches_user_high_idx on public.dating_matches(user_high,created_at desc);
alter table public.dating_blocks enable row level security;
alter table public.dating_reports enable row level security;
alter table public.dating_matches enable row level security;
drop policy if exists dating_blocks_participant_read on public.dating_blocks;
create policy dating_blocks_participant_read on public.dating_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists dating_blocks_owner_insert on public.dating_blocks;
create policy dating_blocks_owner_insert on public.dating_blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
drop policy if exists dating_blocks_owner_delete on public.dating_blocks;
create policy dating_blocks_owner_delete on public.dating_blocks for delete to authenticated using (blocker_id = auth.uid());
drop policy if exists dating_reports_reporter_insert on public.dating_reports;
create policy dating_reports_reporter_insert on public.dating_reports for insert to authenticated with check (reporter_id = auth.uid() and reported_id <> auth.uid());
drop policy if exists dating_reports_reporter_read on public.dating_reports;
create policy dating_reports_reporter_read on public.dating_reports for select to authenticated using (reporter_id = auth.uid());
drop policy if exists dating_matches_participant_read on public.dating_matches;
create policy dating_matches_participant_read on public.dating_matches for select to authenticated using (user_low = auth.uid() or user_high = auth.uid());
revoke all on public.dating_blocks, public.dating_reports, public.dating_matches from anon;
revoke all on public.dating_blocks, public.dating_reports, public.dating_matches from public;
grant select,insert,delete on public.dating_blocks to authenticated;
grant select,insert on public.dating_reports to authenticated;
grant select on public.dating_matches to authenticated;

-- Server-side discovery projection never returns exact birth dates.
create or replace function public.get_dating_discover_profiles()
returns table(user_id uuid, age integer, gender text, interested_in text, city text, dating_bio text, enabled boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select p.user_id, extract(year from age(current_date, p.birth_date))::integer,
         p.gender, p.interested_in, p.city, p.dating_bio, p.enabled
  from public.dating_profiles p
  where auth.uid() is not null and p.enabled = true
    and p.birth_date <= (current_date - interval '18 years')::date
    and p.user_id <> auth.uid()
    and not exists (select 1 from public.dating_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid()))
$$;
revoke all on function public.get_dating_discover_profiles() from public, anon;
grant execute on function public.get_dating_discover_profiles() to authenticated;

-- Convert mutual likes into a durable match, safely under concurrent inserts.
create or replace function public.dating_create_mutual_match()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare a uuid; b uuid;
begin
  if exists (select 1 from public.dating_likes l where l.user_id = new.target_user_id and l.target_user_id = new.user_id) then
    a := least(new.user_id, new.target_user_id); b := greatest(new.user_id, new.target_user_id);
    insert into public.dating_matches(user_low,user_high) values (a,b) on conflict (user_low,user_high) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.dating_create_mutual_match() from public, anon, authenticated;
drop trigger if exists dating_mutual_match_after_like on public.dating_likes;
create trigger dating_mutual_match_after_like after insert on public.dating_likes
for each row execute function public.dating_create_mutual_match();

-- The old view uses owner privileges and is replaced by the controlled RPC.
drop view if exists public.dating_discover_profiles;
notify pgrst, 'reload schema';
