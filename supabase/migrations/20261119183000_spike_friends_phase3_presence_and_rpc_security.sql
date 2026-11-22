-- Applied to the SPIKE Supabase project. Phase 3 schema and RPCs.
create or replace function private.spike_friend_recommendation_candidates()
returns table(candidate_id uuid, mutual_count integer)
language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  with caller as (select auth.uid() as user_id),
  my_friends as (
    select mine.following_id as friend_id from public.follows mine
    join public.follows reciprocal on reciprocal.follower_id=mine.following_id and reciprocal.following_id=mine.follower_id and reciprocal.status='accepted'
    where mine.follower_id=(select user_id from caller) and mine.status='accepted'
  )
  select candidate.follower_id, count(distinct candidate.following_id)::integer
  from public.follows candidate join my_friends mf on mf.friend_id=candidate.following_id
  join public.follows reciprocal on reciprocal.follower_id=candidate.following_id and reciprocal.following_id=candidate.follower_id and reciprocal.status='accepted'
  where (select user_id from caller) is not null and candidate.status='accepted' and candidate.follower_id<>(select user_id from caller)
    and not exists(select 1 from public.blocks b where (b.blocker_id=(select user_id from caller) and b.blocked_id=candidate.follower_id) or (b.blocker_id=candidate.follower_id and b.blocked_id=(select user_id from caller)))
    and not exists(select 1 from public.follows f where (f.follower_id=(select user_id from caller) and f.following_id=candidate.follower_id) or (f.follower_id=candidate.follower_id and f.following_id=(select user_id from caller)))
  group by candidate.follower_id;
$$;
revoke all on function private.spike_friend_recommendation_candidates() from public, anon;
grant execute on function private.spike_friend_recommendation_candidates() to authenticated;
create or replace function public.spike_discover_public_members(p_query text default null,p_limit integer default 30,p_offset integer default 0)
returns table(id uuid,username text,display_name text,avatar_url text,verified boolean,spike_id text,created_at timestamptz)
language sql stable security invoker set search_path=pg_catalog,public,private
as $$
 select p.id,p.username,p.display_name,case when p.avatar_path is null then null when p.avatar_path like 'http%' then p.avatar_path else 'https://veagqanfilmbchlvlpcc.supabase.co/storage/v1/object/public/avatars/'||p.avatar_path end,p.is_verified,p.spike_id,p.created_at
 from public.profiles p where auth.uid() is not null and p.id<>auth.uid() and p.account_status='active' and p.is_private=false
 and not exists(select 1 from public.blocks b where b.blocker_id=auth.uid() and b.blocked_id=p.id)
 and (nullif(left(trim(coalesce(p_query,'')),80),'') is null or position(lower(left(trim(p_query),80)) in lower(p.display_name))>0 or position(lower(left(trim(p_query),80)) in lower(p.username))>0 or position(lower(left(trim(p_query),80)) in lower(p.spike_id))>0)
 and not exists(select 1 from public.follows f where (f.follower_id=auth.uid() and f.following_id=p.id) or (f.follower_id=p.id and f.following_id=auth.uid()))
 order by p.created_at desc,p.id limit greatest(1,least(coalesce(p_limit,30),50)) offset greatest(0,least(coalesce(p_offset,0),5000));
$$;
revoke all on function public.spike_discover_public_members(text,integer,integer) from public,anon;
grant execute on function public.spike_discover_public_members(text,integer,integer) to authenticated;
create or replace function public.spike_get_friend_recommendations(p_limit integer default 12,p_offset integer default 0)
returns table(id uuid,username text,display_name text,avatar_url text,verified boolean,spike_id text,mutual_count integer,reason_label text,created_at timestamptz)
language sql stable security invoker set search_path=pg_catalog,public,private
as $$
 select p.id,p.username,p.display_name,case when p.avatar_path is null then null when p.avatar_path like 'http%' then p.avatar_path else 'https://veagqanfilmbchlvlpcc.supabase.co/storage/v1/object/public/avatars/'||p.avatar_path end,p.is_verified,p.spike_id,c.mutual_count,c.mutual_count::text||case when c.mutual_count=1 then ' mutual friend' else ' mutual friends' end,p.created_at
 from private.spike_friend_recommendation_candidates() c join public.profiles p on p.id=c.candidate_id
 where p.account_status='active' and p.is_private=false order by c.mutual_count desc,p.is_verified desc,p.created_at desc,p.id
 limit greatest(1,least(coalesce(p_limit,12),30)) offset greatest(0,least(coalesce(p_offset,0),1000));
$$;
revoke all on function public.spike_discover_public_members(text,integer,integer) from public,anon;
revoke all on function public.spike_get_friend_recommendations(integer,integer) from public,anon;
grant execute on function public.spike_discover_public_members(text,integer,integer) to authenticated;
grant execute on function public.spike_get_friend_recommendations(integer,integer) to authenticated;
create table if not exists private.spike_user_presence(user_id uuid primary key references auth.users(id) on delete cascade,last_seen_at timestamptz not null default now());
create index if not exists spike_user_presence_last_seen_idx on private.spike_user_presence(last_seen_at desc);
alter table private.spike_user_presence enable row level security;
create or replace function public.spike_touch_friends_presence() returns timestamptz language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_user_id uuid:=auth.uid(); v_visible boolean; begin if v_user_id is null then raise exception 'Authentication required'; end if; select p.presence_visible and p.account_status='active' into v_visible from public.profiles p where p.id=v_user_id; if coalesce(v_visible,false) then insert into private.spike_user_presence(user_id,last_seen_at) values(v_user_id,now()) on conflict(user_id) do update set last_seen_at=excluded.last_seen_at; else delete from private.spike_user_presence where user_id=v_user_id; end if; return case when coalesce(v_visible,false) then now() else null end; end; $$;
create or replace function public.spike_get_friends_presence() returns table(user_id uuid,last_seen_at timestamptz,is_online boolean) language sql stable security definer set search_path=pg_catalog,public,private as $$
 select friend.id,presence.last_seen_at,presence.last_seen_at>=now()-interval '150 seconds' from public.follows mine join public.follows reciprocal on reciprocal.follower_id=mine.following_id and reciprocal.following_id=mine.follower_id and reciprocal.status='accepted' join public.profiles friend on friend.id=mine.following_id join private.spike_user_presence presence on presence.user_id=friend.id where auth.uid() is not null and mine.follower_id=auth.uid() and mine.status='accepted' and friend.account_status='active' and friend.presence_visible=true and not exists(select 1 from public.blocks b where (b.blocker_id=auth.uid() and b.blocked_id=friend.id) or (b.blocker_id=friend.id and b.blocked_id=auth.uid())); $$;
revoke all on function public.spike_touch_friends_presence() from public,anon;
revoke all on function public.spike_get_friends_presence() from public,anon;
grant execute on function public.spike_touch_friends_presence() to authenticated;
grant execute on function public.spike_get_friends_presence() to authenticated;
