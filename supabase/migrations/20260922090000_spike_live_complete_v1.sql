-- SPIKE LIVE complete feature pack: streams, event telemetry, guest invitations,
-- participation missions, saves/interests, RLS and Realtime.
create table if not exists public.spike_live_streams (
  id uuid primary key default gen_random_uuid(), host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 160), description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'Chat' check (char_length(trim(category)) between 2 and 60), tags text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  visibility text not null default 'public' check (visibility in ('public','followers','room')),
  playback_url text, thumbnail_url text, room_id text, scheduled_at timestamptz, started_at timestamptz, ended_at timestamptz,
  viewer_count integer not null default 0 check (viewer_count >= 0), peak_viewers integer not null default 0 check (peak_viewers >= 0), unique_viewers integer not null default 0 check (unique_viewers >= 0),
  chat_count integer not null default 0 check (chat_count >= 0), spark_count integer not null default 0 check (spark_count >= 0), poll_count integer not null default 0 check (poll_count >= 0), share_count integer not null default 0 check (share_count >= 0), guest_count integer not null default 0 check (guest_count >= 0), moment_count integer not null default 0 check (moment_count >= 0), returning_viewers integer not null default 0 check (returning_viewers >= 0), avg_watch_seconds integer not null default 0 check (avg_watch_seconds >= 0),
  retention_percent numeric(5,2) not null default 0 check (retention_percent between 0 and 100), momentum numeric(12,4) not null default 0, quality_score numeric(12,4) not null default 0, discovery_score numeric(12,4) not null default 0,
  guest_open boolean not null default false, guest_slots integer not null default 1 check (guest_slots between 0 and 8), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists spike_live_streams_live_idx on public.spike_live_streams(status, started_at desc);
create index if not exists spike_live_streams_momentum_idx on public.spike_live_streams(momentum desc) where status='live';
create index if not exists spike_live_streams_host_idx on public.spike_live_streams(host_id, created_at desc);
create index if not exists spike_live_streams_category_idx on public.spike_live_streams(category, status, started_at desc);

create table if not exists public.spike_live_events (
  id uuid primary key default gen_random_uuid(), stream_id uuid not null references public.spike_live_streams(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('view','join','leave','chat','spark','poll_vote','share','follow','guest_request','guest_join','moment','question','mission_progress','save','report')),
  value integer not null default 1 check (value between 1 and 100), metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists spike_live_events_stream_time_idx on public.spike_live_events(stream_id, created_at desc);
create index if not exists spike_live_events_type_time_idx on public.spike_live_events(event_type, created_at desc);
create index if not exists spike_live_events_actor_time_idx on public.spike_live_events(actor_id, created_at desc);

create table if not exists public.spike_live_guests (
  id uuid primary key default gen_random_uuid(), stream_id uuid not null references public.spike_live_streams(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade, guest_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled','removed')), note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(), responded_at timestamptz, unique(stream_id, guest_id)
);
create index if not exists spike_live_guests_host_idx on public.spike_live_guests(host_id, status, created_at desc);
create index if not exists spike_live_guests_guest_idx on public.spike_live_guests(guest_id, status, created_at desc);

create table if not exists public.spike_live_missions (
  id uuid primary key default gen_random_uuid(), stream_id uuid references public.spike_live_streams(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120), description text not null default '' check (char_length(description) <= 500),
  mission_type text not null check (mission_type in ('sparks','questions','votes','shares','viewers','chat','guests','moments')),
  target_value integer not null check (target_value > 0), reward_xp integer not null default 0 check (reward_xp >= 0), reward_coins integer not null default 0 check (reward_coins >= 0), active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists spike_live_missions_stream_idx on public.spike_live_missions(stream_id, active, created_at desc);
create table if not exists public.spike_live_mission_progress (
  mission_id uuid not null references public.spike_live_missions(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0), completed_at timestamptz, updated_at timestamptz not null default now(), primary key(mission_id,user_id)
);
create table if not exists public.spike_live_saves (stream_id uuid not null references public.spike_live_streams(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key(stream_id,user_id));
create table if not exists public.spike_live_interests (stream_id uuid not null references public.spike_live_streams(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, reminder boolean not null default true, created_at timestamptz not null default now(), primary key(stream_id,user_id));

alter table public.spike_live_streams enable row level security;
alter table public.spike_live_events enable row level security;
alter table public.spike_live_guests enable row level security;
alter table public.spike_live_missions enable row level security;
alter table public.spike_live_mission_progress enable row level security;
alter table public.spike_live_saves enable row level security;
alter table public.spike_live_interests enable row level security;
revoke all on public.spike_live_streams, public.spike_live_events, public.spike_live_guests, public.spike_live_missions, public.spike_live_mission_progress, public.spike_live_saves, public.spike_live_interests from anon;
grant select,insert,update,delete on public.spike_live_streams to authenticated;
grant select,insert on public.spike_live_events to authenticated;
grant select,insert,update on public.spike_live_guests to authenticated;
grant select on public.spike_live_missions to authenticated;
grant select,insert,update on public.spike_live_mission_progress to authenticated;
grant select,insert,delete on public.spike_live_saves to authenticated;
grant select,insert,update,delete on public.spike_live_interests to authenticated;

drop policy if exists spike_live_streams_read on public.spike_live_streams;
create policy spike_live_streams_read on public.spike_live_streams for select to authenticated using (status in ('live','scheduled') or host_id=(select auth.uid()));
drop policy if exists spike_live_streams_insert on public.spike_live_streams;
create policy spike_live_streams_insert on public.spike_live_streams for insert to authenticated with check (host_id=(select auth.uid()));
drop policy if exists spike_live_streams_update on public.spike_live_streams;
create policy spike_live_streams_update on public.spike_live_streams for update to authenticated using (host_id=(select auth.uid())) with check (host_id=(select auth.uid()));
drop policy if exists spike_live_streams_delete on public.spike_live_streams;
create policy spike_live_streams_delete on public.spike_live_streams for delete to authenticated using (host_id=(select auth.uid()));

drop policy if exists spike_live_events_read on public.spike_live_events;
create policy spike_live_events_read on public.spike_live_events for select to authenticated using (actor_id=(select auth.uid()) or exists(select 1 from public.spike_live_streams s where s.id=stream_id and s.host_id=(select auth.uid())));
drop policy if exists spike_live_events_insert on public.spike_live_events;
create policy spike_live_events_insert on public.spike_live_events for insert to authenticated with check (actor_id=(select auth.uid()));

drop policy if exists spike_live_guests_read on public.spike_live_guests;
create policy spike_live_guests_read on public.spike_live_guests for select to authenticated using (host_id=(select auth.uid()) or guest_id=(select auth.uid()));
drop policy if exists spike_live_guests_insert on public.spike_live_guests;
create policy spike_live_guests_insert on public.spike_live_guests for insert to authenticated with check (guest_id=(select auth.uid()) and exists(select 1 from public.spike_live_streams s where s.id=spike_live_guests.stream_id and s.host_id=spike_live_guests.host_id and s.status='live' and s.guest_open=true));
drop policy if exists spike_live_guests_update on public.spike_live_guests;
create policy spike_live_guests_update on public.spike_live_guests for update to authenticated using (host_id=(select auth.uid()) or guest_id=(select auth.uid())) with check (host_id=(select auth.uid()) or guest_id=(select auth.uid()));

drop policy if exists spike_live_missions_read on public.spike_live_missions;
create policy spike_live_missions_read on public.spike_live_missions for select to authenticated using (active=true and (stream_id is null or exists(select 1 from public.spike_live_streams s where s.id=stream_id and s.status in ('live','scheduled'))));
drop policy if exists spike_live_mission_progress_read on public.spike_live_mission_progress;
create policy spike_live_mission_progress_read on public.spike_live_mission_progress for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists spike_live_mission_progress_insert on public.spike_live_mission_progress;
create policy spike_live_mission_progress_insert on public.spike_live_mission_progress for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists spike_live_mission_progress_update on public.spike_live_mission_progress;
create policy spike_live_mission_progress_update on public.spike_live_mission_progress for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists spike_live_saves_owner on public.spike_live_saves;
create policy spike_live_saves_owner on public.spike_live_saves for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists spike_live_interests_owner on public.spike_live_interests;
create policy spike_live_interests_owner on public.spike_live_interests for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create or replace function public.spike_live_touch_updated_at() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists spike_live_streams_touch on public.spike_live_streams;
create trigger spike_live_streams_touch before update on public.spike_live_streams for each row execute function public.spike_live_touch_updated_at();
drop trigger if exists spike_live_mission_progress_touch on public.spike_live_mission_progress;
create trigger spike_live_mission_progress_touch before update on public.spike_live_mission_progress for each row execute function public.spike_live_touch_updated_at();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spike_live_streams') then alter publication supabase_realtime add table public.spike_live_streams; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spike_live_guests') then alter publication supabase_realtime add table public.spike_live_guests; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spike_live_missions') then alter publication supabase_realtime add table public.spike_live_missions; end if;
end $$;
