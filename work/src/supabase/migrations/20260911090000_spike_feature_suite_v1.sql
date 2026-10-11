-- SPIKE Feature Suite v1
-- Adds the new feature layer without replacing existing product systems.

create table if not exists public.spike_custom_feeds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  description text not null default '',
  rules jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spike_custom_feeds_owner_idx on public.spike_custom_feeds(owner_id, updated_at desc);

create table if not exists public.spike_polls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id text,
  question text not null check (char_length(trim(question)) between 1 and 500),
  multi_select boolean not null default false,
  anonymous boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, post_id)
);
create table if not exists public.spike_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.spike_polls(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 160),
  position integer not null default 0,
  unique(poll_id, position)
);
create table if not exists public.spike_poll_votes (
  poll_id uuid not null references public.spike_polls(id) on delete cascade,
  option_id uuid not null references public.spike_poll_options(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(poll_id, option_id, voter_id)
);
create index if not exists spike_poll_votes_voter_idx on public.spike_poll_votes(voter_id, created_at desc);

create table if not exists public.spike_signal_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '',
  cover_url text,
  status text not null default 'active' check (status in ('draft','active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.spike_series_items (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.spike_signal_series(id) on delete cascade,
  post_id text not null,
  position integer not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  unique(series_id, post_id),
  unique(series_id, position)
);
create index if not exists spike_series_owner_idx on public.spike_signal_series(owner_id, updated_at desc);

create table if not exists public.spike_signal_collaborators (
  post_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  collaborator_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','removed')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key(post_id, collaborator_id)
);
create index if not exists spike_signal_collaborators_user_idx on public.spike_signal_collaborators(collaborator_id, status, created_at desc);

create table if not exists public.spike_creator_memberships (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '',
  monthly_coins integer not null check (monthly_coins between 1 and 1000000),
  benefits jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.spike_membership_members (
  membership_id uuid not null references public.spike_creator_memberships(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  primary key(membership_id, member_id)
);
create index if not exists spike_memberships_creator_idx on public.spike_creator_memberships(creator_id, active, updated_at desc);

create table if not exists public.spike_creator_products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 140),
  description text not null default '',
  product_type text not null default 'digital' check (product_type in ('digital','resource','course','collection')),
  price_coins integer not null check (price_coins between 1 and 1000000),
  asset_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spike_creator_products_creator_idx on public.spike_creator_products(creator_id, active, created_at desc);

create table if not exists public.spike_reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  points integer not null check (points between -100 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists spike_reputation_events_user_idx on public.spike_reputation_events(user_id, created_at desc);

create table if not exists public.spike_resume_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  title text not null,
  route text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(user_id, action_key)
);
create index if not exists spike_resume_states_user_idx on public.spike_resume_states(user_id, updated_at desc);

-- Generic updated_at helper for the new editable records.
create or replace function public.spike_feature_touch_updated_at()
returns trigger language plpgsql security invoker as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists spike_custom_feeds_touch on public.spike_custom_feeds;
create trigger spike_custom_feeds_touch before update on public.spike_custom_feeds for each row execute function public.spike_feature_touch_updated_at();
drop trigger if exists spike_series_touch on public.spike_signal_series;
create trigger spike_series_touch before update on public.spike_signal_series for each row execute function public.spike_feature_touch_updated_at();
drop trigger if exists spike_membership_touch on public.spike_creator_memberships;
create trigger spike_membership_touch before update on public.spike_creator_memberships for each row execute function public.spike_feature_touch_updated_at();
drop trigger if exists spike_product_touch on public.spike_creator_products;
create trigger spike_product_touch before update on public.spike_creator_products for each row execute function public.spike_feature_touch_updated_at();

-- Secure row access. The client uses authenticated users only.
alter table public.spike_custom_feeds enable row level security;
alter table public.spike_polls enable row level security;
alter table public.spike_poll_options enable row level security;
alter table public.spike_poll_votes enable row level security;
alter table public.spike_signal_series enable row level security;
alter table public.spike_series_items enable row level security;
alter table public.spike_signal_collaborators enable row level security;
alter table public.spike_creator_memberships enable row level security;
alter table public.spike_membership_members enable row level security;
alter table public.spike_creator_products enable row level security;
alter table public.spike_reputation_events enable row level security;
alter table public.spike_resume_states enable row level security;

-- Ownership and participation policies. Public discovery remains mediated by authenticated reads.
drop policy if exists spike_custom_feeds_owner on public.spike_custom_feeds;
create policy spike_custom_feeds_owner on public.spike_custom_feeds for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists spike_polls_owner on public.spike_polls;
create policy spike_polls_owner on public.spike_polls for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists spike_poll_options_owner on public.spike_poll_options;
create policy spike_poll_options_owner on public.spike_poll_options for all using (exists(select 1 from public.spike_polls p where p.id=poll_id and p.owner_id=auth.uid())) with check (exists(select 1 from public.spike_polls p where p.id=poll_id and p.owner_id=auth.uid()));
drop policy if exists spike_poll_votes_owner on public.spike_poll_votes;
create policy spike_poll_votes_owner on public.spike_poll_votes for all using (voter_id=auth.uid()) with check (voter_id=auth.uid());
drop policy if exists spike_series_owner on public.spike_signal_series;
create policy spike_series_owner on public.spike_signal_series for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists spike_series_items_owner on public.spike_series_items;
create policy spike_series_items_owner on public.spike_series_items for all using (exists(select 1 from public.spike_signal_series s where s.id=series_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.spike_signal_series s where s.id=series_id and s.owner_id=auth.uid()));
drop policy if exists spike_collab_participant on public.spike_signal_collaborators;
create policy spike_collab_participant on public.spike_signal_collaborators for all using (owner_id=auth.uid() or collaborator_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists spike_membership_creator on public.spike_creator_memberships;
create policy spike_membership_creator on public.spike_creator_memberships for all using (creator_id=auth.uid()) with check (creator_id=auth.uid());
drop policy if exists spike_membership_member on public.spike_membership_members;
create policy spike_membership_member on public.spike_membership_members for all using (member_id=auth.uid()) with check (member_id=auth.uid());
drop policy if exists spike_product_creator on public.spike_creator_products;
create policy spike_product_creator on public.spike_creator_products for all using (creator_id=auth.uid()) with check (creator_id=auth.uid());
drop policy if exists spike_reputation_owner on public.spike_reputation_events;
create policy spike_reputation_owner on public.spike_reputation_events for select using (user_id=auth.uid());
drop policy if exists spike_resume_owner on public.spike_resume_states;
create policy spike_resume_owner on public.spike_resume_states for all using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Poll voting is atomic and prevents a second vote on the same option.
create or replace function public.spike_cast_poll_vote(p_poll_id uuid, p_option_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid := auth.uid(); picked uuid; n integer; multi boolean; closed_at timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select multi_select, closes_at into multi, closed_at from public.spike_polls where id=p_poll_id;
  if not found then raise exception 'Poll not found'; end if;
  if closed_at is not null and closed_at <= now() then raise exception 'Poll is closed'; end if;
  n := coalesce(array_length(p_option_ids,1),0);
  if n < 1 then raise exception 'Choose at least one option'; end if;
  if not multi and n <> 1 then raise exception 'Choose one option'; end if;
  foreach picked in array p_option_ids loop
    if not exists(select 1 from public.spike_poll_options where id=picked and poll_id=p_poll_id) then raise exception 'Invalid poll option'; end if;
    insert into public.spike_poll_votes(poll_id,option_id,voter_id) values(p_poll_id,picked,uid) on conflict do nothing;
  end loop;
  return jsonb_build_object('ok',true,'poll_id',p_poll_id,'votes_added',n);
end $$;
grant execute on function public.spike_cast_poll_vote(uuid,uuid[]) to authenticated;

create or replace function public.spike_my_reputation()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'score', greatest(0, least(100, 50 + coalesce(sum(points),0))),
    'events', count(*)
  ) from public.spike_reputation_events where user_id=auth.uid();
$$;
grant execute on function public.spike_my_reputation() to authenticated;
