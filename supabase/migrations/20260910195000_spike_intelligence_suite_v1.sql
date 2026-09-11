create table if not exists public.spike_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  note text not null check (char_length(note) between 1 and 2000),
  source_type text not null default 'manual' check (source_type in ('manual','activity','post','event','room')),
  source_id text,
  remind_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spike_memories_user_created_idx on public.spike_memories(user_id, created_at desc);

create table if not exists public.spike_collaborations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spike_collaborations_owner_idx on public.spike_collaborations(owner_id, updated_at desc);

create table if not exists public.spike_collaboration_members (
  collaboration_id uuid not null references public.spike_collaborations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'contributor' check (role in ('owner','contributor')),
  joined_at timestamptz not null default now(),
  primary key (collaboration_id,user_id)
);
create index if not exists spike_collaboration_members_user_idx on public.spike_collaboration_members(user_id, joined_at desc);

alter table public.spike_memories enable row level security;
alter table public.spike_collaborations enable row level security;
alter table public.spike_collaboration_members enable row level security;

drop policy if exists spike_memories_owner_select on public.spike_memories;
create policy spike_memories_owner_select on public.spike_memories for select to authenticated using (user_id=auth.uid());
drop policy if exists spike_memories_owner_insert on public.spike_memories;
create policy spike_memories_owner_insert on public.spike_memories for insert to authenticated with check (user_id=auth.uid());
drop policy if exists spike_memories_owner_update on public.spike_memories;
create policy spike_memories_owner_update on public.spike_memories for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists spike_memories_owner_delete on public.spike_memories;
create policy spike_memories_owner_delete on public.spike_memories for delete to authenticated using (user_id=auth.uid());

drop policy if exists spike_collaborations_member_select on public.spike_collaborations;
create policy spike_collaborations_member_select on public.spike_collaborations for select to authenticated using (owner_id=auth.uid() or exists (select 1 from public.spike_collaboration_members m where m.collaboration_id=id and m.user_id=auth.uid()));
drop policy if exists spike_collaborations_owner_insert on public.spike_collaborations;
create policy spike_collaborations_owner_insert on public.spike_collaborations for insert to authenticated with check (owner_id=auth.uid());
drop policy if exists spike_collaborations_owner_update on public.spike_collaborations;
create policy spike_collaborations_owner_update on public.spike_collaborations for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists spike_collaborations_owner_delete on public.spike_collaborations;
create policy spike_collaborations_owner_delete on public.spike_collaborations for delete to authenticated using (owner_id=auth.uid());

drop policy if exists spike_collab_members_select on public.spike_collaboration_members;
create policy spike_collab_members_select on public.spike_collaboration_members for select to authenticated using (user_id=auth.uid() or exists (select 1 from public.spike_collaborations c where c.id=collaboration_id and c.owner_id=auth.uid()));
drop policy if exists spike_collab_members_owner_insert on public.spike_collaboration_members;
create policy spike_collab_members_owner_insert on public.spike_collaboration_members for insert to authenticated with check (exists (select 1 from public.spike_collaborations c where c.id=collaboration_id and c.owner_id=auth.uid()));
drop policy if exists spike_collab_members_owner_delete on public.spike_collaboration_members;
create policy spike_collab_members_owner_delete on public.spike_collaboration_members for delete to authenticated using (exists (select 1 from public.spike_collaborations c where c.id=collaboration_id and c.owner_id=auth.uid()));

create or replace function public.get_spike_reputation_v1()
returns table(score integer, helpful integer, community integer, creator integer, reliability integer, contributions integer, streak_days integer)
language sql stable security definer set search_path=public
as $$
with me as (select auth.uid() uid),
comments as (select count(*) n from public.comments c, me where c.user_id=me.uid),
eng as (select count(*) n from public.post_engagement_events e, me where e.actor_id=me.uid and e.action_type in ('comment','save','share','like','reaction','view')), 
rooms as (select count(*) n from public.room_messages m, me where m.user_id=me.uid),
friends as (select count(*) n from public.friendships f, me where f.user_id=me.uid or f.friend_id=me.uid),
preds as (select count(*) n from public.spike_predictions p, me where p.id is not null and p.created_at >= now()-interval '365 days'),
acts as (select count(*) n from public.user_activity_events a, me where a.user_id=me.uid and a.created_at >= now()-interval '90 days'),
profile as (select coalesce(current_streak,0) streak from public.profiles p, me where p.id=me.uid)
select least(100, greatest(0, (comments.n*3 + rooms.n*2 + eng.n + friends.n + preds.n + acts.n/3 + profile.streak)::int)) score,
 least(100, greatest(0,(comments.n*5+eng.n/2)::int)) helpful,
 least(100, greatest(0,(rooms.n*4+friends.n*2+acts.n/4)::int)) community,
 least(100, greatest(0,(eng.n/3+acts.n/5+preds.n*2)::int)) creator,
 least(100, greatest(0,(friends.n*2+profile.streak*2+acts.n/5)::int)) reliability,
 (comments.n+rooms.n+eng.n+preds.n+acts.n)::int contributions,
 profile.streak::int streak_days
from comments,eng,rooms,friends,preds,acts,profile;
$$;
revoke execute on function public.get_spike_reputation_v1() from public,anon;
grant execute on function public.get_spike_reputation_v1() to authenticated;

create or replace function public.get_spike_intelligence_snapshot_v1()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'not authenticated'; end if;
 select jsonb_build_object(
  'reputation',coalesce((select to_jsonb(r) from public.get_spike_reputation_v1() r),'{}'::jsonb),
  'activity_24h',coalesce((select count(*) from public.user_activity_events where user_id=uid and created_at>=now()-interval '24 hours'),0),
  'comments_7d',coalesce((select count(*) from public.comments where user_id=uid and created_at>=now()-interval '7 days'),0),
  'room_messages_7d',coalesce((select count(*) from public.room_messages where user_id=uid and created_at>=now()-interval '7 days'),0),
  'friend_count',coalesce((select count(*) from public.friendships where user_id=uid or friend_id=uid),0),
  'predictions_30d',coalesce((select count(*) from public.spike_predictions where created_at>=now()-interval '30 days'),0),
  'upcoming_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_at) from (select id,title,description,room_id,starts_at,ends_at from public.room_events where starts_at>=now() order by starts_at limit 5) e),'[]'::jsonb),
  'active_rooms',coalesce((select jsonb_agg(to_jsonb(r) order by r.featured desc,r.updated_at desc) from (select id,name,description,category,emoji,featured,updated_at from public.rooms where active is not false order by featured desc,updated_at desc limit 8) r),'[]'::jsonb),
  'recent_activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select event_type,source_id,metadata,created_at from public.user_activity_events where user_id=uid order by created_at desc limit 12) a),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;
revoke execute on function public.get_spike_intelligence_snapshot_v1() from public,anon;
grant execute on function public.get_spike_intelligence_snapshot_v1() to authenticated;
