-- SPIKE Native Social Layer v2
-- Native primitives: Pulses, Topics, Signal Lenses, Echo metadata, and Momentum support.
-- All exposed tables use RLS. New public-schema tables are explicitly granted because
-- Supabase no longer exposes new public tables to the Data API automatically.

create table if not exists public.spike_pulses (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 5000),
  media_url text,
  media_type text check (media_type is null or media_type in ('image','video','audio')),
  mood text,
  prompt text,
  visibility text not null default 'connections' check (visibility in ('public','connections','circle')),
  circle_id uuid references public.spike_circles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at > created_at)
);
create index if not exists spike_pulses_active_idx on public.spike_pulses(expires_at desc, created_at desc);
create index if not exists spike_pulses_author_idx on public.spike_pulses(author_id, created_at desc);

create table if not exists public.spike_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and char_length(slug) between 2 and 80),
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.spike_topic_followers (
  topic_id uuid not null references public.spike_topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(topic_id,user_id)
);
create table if not exists public.spike_signal_topics (
  post_id text not null,
  topic_id uuid not null references public.spike_topics(id) on delete cascade,
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  primary key(post_id,topic_id)
);
create index if not exists spike_signal_topics_topic_idx on public.spike_signal_topics(topic_id,created_at desc);

create table if not exists public.spike_signal_lenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text not null default '',
  rules jsonb not null default '{}'::jsonb,
  sort_mode text not null default 'momentum' check (sort_mode in ('momentum','latest','depth','topic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spike_signal_lenses_owner_idx on public.spike_signal_lenses(owner_id,updated_at desc);

-- Echoes extend the existing comment primitive with SPIKE-native intent.
alter table if exists public.comments add column if not exists echo_kind text not null default 'add' check (echo_kind in ('add','challenge','support','question','context'));
alter table if exists public.comments add column if not exists echo_depth integer not null default 0 check (echo_depth >= 0 and echo_depth <= 20);

create or replace function public.spike_touch_native_updated_at()
returns trigger language plpgsql security invoker as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists spike_signal_lenses_touch on public.spike_signal_lenses;
create trigger spike_signal_lenses_touch before update on public.spike_signal_lenses for each row execute function public.spike_touch_native_updated_at();

alter table public.spike_pulses enable row level security;
alter table public.spike_topics enable row level security;
alter table public.spike_topic_followers enable row level security;
alter table public.spike_signal_topics enable row level security;
alter table public.spike_signal_lenses enable row level security;

revoke all on public.spike_pulses, public.spike_topics, public.spike_topic_followers, public.spike_signal_topics, public.spike_signal_lenses from public,anon,authenticated;
grant select on public.spike_pulses, public.spike_topics, public.spike_topic_followers, public.spike_signal_topics, public.spike_signal_lenses to authenticated;
grant insert,update,delete on public.spike_pulses, public.spike_topic_followers, public.spike_signal_topics, public.spike_signal_lenses to authenticated;

drop policy if exists spike_pulses_read on public.spike_pulses;
create policy spike_pulses_read on public.spike_pulses for select to authenticated using (
  expires_at > now() and (
    visibility='public' or author_id=(select auth.uid()) or
    (visibility='connections' and exists(select 1 from public.friendships f where (f.user_id=(select auth.uid()) and f.friend_id=author_id) or (f.friend_id=(select auth.uid()) and f.user_id=author_id))) or
    (visibility='circle' and circle_id is not null and exists(select 1 from public.spike_circle_members cm where cm.circle_id=spike_pulses.circle_id and cm.user_id=(select auth.uid())))
  )
);
drop policy if exists spike_pulses_owner_write on public.spike_pulses;
create policy spike_pulses_owner_write on public.spike_pulses for all to authenticated using (author_id=(select auth.uid())) with check (author_id=(select auth.uid()));

drop policy if exists spike_topics_read on public.spike_topics;
create policy spike_topics_read on public.spike_topics for select to authenticated using (true);
drop policy if exists spike_topics_create on public.spike_topics;
create policy spike_topics_create on public.spike_topics for insert to authenticated with check (created_by=(select auth.uid()));

drop policy if exists spike_topic_followers_owner on public.spike_topic_followers;
create policy spike_topic_followers_owner on public.spike_topic_followers for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists spike_signal_topics_read on public.spike_signal_topics;
create policy spike_signal_topics_read on public.spike_signal_topics for select to authenticated using (true);
drop policy if exists spike_signal_topics_write on public.spike_signal_topics;
create policy spike_signal_topics_write on public.spike_signal_topics for all to authenticated using (exists(select 1 from public.app_documents p where p.collection_name='posts' and p.document_id=post_id and p.owner_id=(select auth.uid()))) with check (exists(select 1 from public.app_documents p where p.collection_name='posts' and p.document_id=post_id and p.owner_id=(select auth.uid())));

drop policy if exists spike_signal_lenses_owner on public.spike_signal_lenses;
create policy spike_signal_lenses_owner on public.spike_signal_lenses for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));

-- Momentum is calculated client-side from the already-authorized Signal payloads and engagement counters.
-- This avoids broadening access to private creator engagement events.
