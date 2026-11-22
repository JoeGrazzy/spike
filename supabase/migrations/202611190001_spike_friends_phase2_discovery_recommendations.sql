-- SPIKE Friends Phase 2: privacy-safe paginated discovery and mutual-friend recommendations.
create or replace function public.spike_discover_public_members(
  p_query text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  spike_id text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with caller as (select auth.uid() as user_id)
  select p.id, p.username, p.display_name,
    case when p.avatar_path is null then null
      when p.avatar_path like 'http%' then p.avatar_path
      else 'https://veagqanfilmbchlvlpcc.supabase.co/storage/v1/object/public/avatars/' || p.avatar_path
    end as avatar_url,
    p.is_verified as verified, p.spike_id, p.created_at
  from public.profiles p
  cross join caller c
  where c.user_id is not null
    and p.id <> c.user_id
    and p.account_status = 'active'
    and p.is_private = false
    and private.can_view_profile(p.id)
    and (nullif(left(trim(coalesce(p_query, '')), 80), '') is null
      or position(lower(left(trim(p_query), 80)) in lower(p.display_name)) > 0
      or position(lower(left(trim(p_query), 80)) in lower(p.username)) > 0
      or position(lower(left(trim(p_query), 80)) in lower(p.spike_id)) > 0)
    and not exists (select 1 from public.blocks b
      where (b.blocker_id = c.user_id and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = c.user_id))
    and not exists (select 1 from public.follows f
      where (f.follower_id = c.user_id and f.following_id = p.id)
         or (f.follower_id = p.id and f.following_id = c.user_id))
  order by p.created_at desc, p.id
  limit greatest(1, least(coalesce(p_limit, 30), 50))
  offset greatest(0, least(coalesce(p_offset, 0), 5000));
$$;

create or replace function public.spike_get_friend_recommendations(
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  spike_id text,
  mutual_count integer,
  reason_label text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with caller as (select auth.uid() as user_id),
  my_friends as (
    select mine.following_id as friend_id
    from public.follows mine
    join public.follows reciprocal
      on reciprocal.follower_id = mine.following_id
     and reciprocal.following_id = mine.follower_id
     and reciprocal.status = 'accepted'
    where mine.follower_id = (select user_id from caller)
      and mine.status = 'accepted'
  ),
  candidate_mutuals as (
    select candidate_follows.follower_id as candidate_id,
           count(distinct candidate_follows.following_id)::integer as mutual_count
    from public.follows candidate_follows
    join my_friends mf on mf.friend_id = candidate_follows.following_id
    join public.follows candidate_reciprocal
      on candidate_reciprocal.follower_id = candidate_follows.following_id
     and candidate_reciprocal.following_id = candidate_follows.follower_id
     and candidate_reciprocal.status = 'accepted'
    where candidate_follows.status = 'accepted'
      and candidate_follows.follower_id <> (select user_id from caller)
    group by candidate_follows.follower_id
  )
  select p.id, p.username, p.display_name,
    case when p.avatar_path is null then null
      when p.avatar_path like 'http%' then p.avatar_path
      else 'https://veagqanfilmbchlvlpcc.supabase.co/storage/v1/object/public/avatars/' || p.avatar_path
    end as avatar_url,
    p.is_verified as verified, p.spike_id, cm.mutual_count,
    cm.mutual_count::text || case when cm.mutual_count = 1 then ' mutual friend' else ' mutual friends' end as reason_label,
    p.created_at
  from candidate_mutuals cm
  join public.profiles p on p.id = cm.candidate_id
  where (select user_id from caller) is not null
    and p.account_status = 'active'
    and p.is_private = false
    and private.can_view_profile(p.id)
    and not exists (select 1 from public.blocks b
      where (b.blocker_id = (select user_id from caller) and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = (select user_id from caller)))
    and not exists (select 1 from public.follows f
      where (f.follower_id = (select user_id from caller) and f.following_id = p.id)
         or (f.follower_id = p.id and f.following_id = (select user_id from caller)))
  order by cm.mutual_count desc, p.is_verified desc, p.created_at desc, p.id
  limit greatest(1, least(coalesce(p_limit, 12), 30))
  offset greatest(0, least(coalesce(p_offset, 0), 1000));
$$;

revoke all on function public.spike_discover_public_members(text, integer, integer) from public, anon;
revoke all on function public.spike_get_friend_recommendations(integer, integer) from public, anon;
grant execute on function public.spike_discover_public_members(text, integer, integer) to authenticated;
grant execute on function public.spike_get_friend_recommendations(integer, integer) to authenticated;
