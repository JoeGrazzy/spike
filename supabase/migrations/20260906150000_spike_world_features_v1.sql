-- SPIKE World: Battles, Signal Chains, Community Missions, Seasons, and Circles.
-- All mutations are server-authoritative and authenticated-only.

create table if not exists public.spike_battles (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  post_id text,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 500),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  ends_at timestamptz not null default (now() + interval '48 hours'),
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (creator_id <> opponent_id)
);
create index if not exists spike_battles_open_idx on public.spike_battles(status, ends_at desc);
create index if not exists spike_battles_people_idx on public.spike_battles(creator_id, opponent_id, created_at desc);

create table if not exists public.spike_battle_votes (
  battle_id uuid not null references public.spike_battles(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  choice_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (battle_id, voter_id),
  check (choice_user_id <> voter_id)
);
create index if not exists spike_battle_votes_choice_idx on public.spike_battle_votes(battle_id, choice_user_id);

create table if not exists public.spike_signal_chains (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  root_post_id text,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);
create table if not exists public.spike_signal_chain_entries (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.spike_signal_chains(id) on delete cascade,
  parent_entry_id uuid references public.spike_signal_chain_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists spike_chain_entries_chain_idx on public.spike_signal_chain_entries(chain_id, created_at);

create table if not exists public.spike_community_missions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 500),
  target integer not null check (target between 1 and 100000),
  xp_reward integer not null default 100 check (xp_reward between 0 and 10000),
  max_participants integer not null default 100 check (max_participants between 2 and 10000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '7 days'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.spike_community_mission_members (
  mission_id uuid not null references public.spike_community_missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);
create index if not exists spike_missions_active_idx on public.spike_community_missions(active, ends_at desc);

create table if not exists public.spike_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.spike_season_points (
  season_id uuid not null references public.spike_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index if not exists spike_season_points_rank_idx on public.spike_season_points(season_id, points desc);

create table if not exists public.spike_circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  privacy text not null default 'private' check (privacy in ('private','discoverable')),
  created_at timestamptz not null default now()
);
create table if not exists public.spike_circle_members (
  circle_id uuid not null references public.spike_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create table if not exists public.spike_circle_messages (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.spike_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists spike_circle_messages_idx on public.spike_circle_messages(circle_id, created_at desc);

alter table public.spike_battles enable row level security;
alter table public.spike_battle_votes enable row level security;
alter table public.spike_signal_chains enable row level security;
alter table public.spike_signal_chain_entries enable row level security;
alter table public.spike_community_missions enable row level security;
alter table public.spike_community_mission_members enable row level security;
alter table public.spike_seasons enable row level security;
alter table public.spike_season_points enable row level security;
alter table public.spike_circles enable row level security;
alter table public.spike_circle_members enable row level security;
alter table public.spike_circle_messages enable row level security;

revoke all on public.spike_battles, public.spike_battle_votes, public.spike_signal_chains, public.spike_signal_chain_entries,
  public.spike_community_missions, public.spike_community_mission_members, public.spike_seasons, public.spike_season_points,
  public.spike_circles, public.spike_circle_members, public.spike_circle_messages from anon, public, authenticated;

grant select on public.spike_battles, public.spike_signal_chains, public.spike_signal_chain_entries, public.spike_community_missions,
  public.spike_seasons, public.spike_season_points, public.spike_circles, public.spike_circle_members, public.spike_circle_messages to authenticated;

create or replace function public.spike_world_people(p_query text default '')
returns table(id uuid, display_name text, username text, avatar_url text, sp_id text)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,p.display_name,p.username,p.avatar_url,p.sp_id
  from public.profiles p
  where p.id in (
    select f.friend_id from public.friendships f where f.user_id=(select auth.uid())
    union
    select f.user_id from public.friendships f where f.friend_id=(select auth.uid())
  )
  and (
    nullif(trim(p_query),'') is null or
    lower(coalesce(p.display_name,'')) like '%'||lower(trim(p_query))||'%' or
    lower(coalesce(p.username,'')) like '%'||lower(trim(p_query))||'%' or
    lower(coalesce(p.sp_id,'')) like '%'||lower(trim(p_query))||'%'
  )
  order by lower(coalesce(p.display_name,p.username,''))
  limit 50;
$$;

create or replace function public.spike_battles_list()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); out jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.spike_battles set status='closed', closed_at=coalesce(closed_at,now())
  where status='open' and ends_at<=now();
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into out from (
    select b.id,b.creator_id,b.opponent_id,b.post_id,b.title,b.description,b.status,b.ends_at,b.winner_id,b.created_at,
      pc.display_name creator_name,pc.username creator_username,pc.avatar_url creator_avatar,
      po.display_name opponent_name,po.username opponent_username,po.avatar_url opponent_avatar,
      (select count(*) from public.spike_battle_votes v where v.battle_id=b.id and v.choice_user_id=b.creator_id) creator_votes,
      (select count(*) from public.spike_battle_votes v where v.battle_id=b.id and v.choice_user_id=b.opponent_id) opponent_votes,
      exists(select 1 from public.spike_battle_votes v where v.battle_id=b.id and v.voter_id=uid) voted
    from public.spike_battles b join public.profiles pc on pc.id=b.creator_id join public.profiles po on po.id=b.opponent_id
    where b.creator_id=uid or b.opponent_id=uid or exists(select 1 from public.spike_battle_votes v where v.battle_id=b.id and v.voter_id=uid)
    or b.status='open'
    limit 100
  ) x;
  return out;
end $$;

create or replace function public.spike_battle_create(p_opponent_id uuid,p_title text,p_description text default '',p_post_id text default null,p_duration_hours integer default 48)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); bid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_opponent_id is null or p_opponent_id=uid then raise exception 'Choose another person'; end if;
  if not exists(select 1 from public.friendships f where (f.user_id=uid and f.friend_id=p_opponent_id) or (f.user_id=p_opponent_id and f.friend_id=uid)) then raise exception 'Battles are available between friends'; end if;
  insert into public.spike_battles(creator_id,opponent_id,post_id,title,description,ends_at)
  values(uid,p_opponent_id,nullif(trim(p_post_id),''),trim(p_title),coalesce(trim(p_description),''),now()+make_interval(hours=>least(greatest(coalesce(p_duration_hours,48),1),168))) returning id into bid;
  insert into public.notifications(user_id,type,data,priority,event_key,group_key) values(p_opponent_id,'spike_battle_invite',jsonb_build_object('battle_id',bid,'title',trim(p_title),'from_user_id',uid),'high','spike_battle_invite:'||bid::text,'spike_battle:'||bid::text);
  return jsonb_build_object('ok',true,'battle_id',bid);
end $$;

create or replace function public.spike_battle_vote(p_battle_id uuid,p_choice_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); b public.spike_battles; cv int; ov int; winner uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into b from public.spike_battles where id=p_battle_id for update;
  if not found then raise exception 'Battle not found'; end if;
  if b.status<>'open' or b.ends_at<=now() then raise exception 'This battle is closed'; end if;
  if p_choice_user_id not in (b.creator_id,b.opponent_id) then raise exception 'Invalid battle choice'; end if;
  if uid in (b.creator_id,b.opponent_id) then raise exception 'Participants cannot vote in their own battle'; end if;
  insert into public.spike_battle_votes(battle_id,voter_id,choice_user_id) values(b.id,uid,p_choice_user_id)
  on conflict (battle_id,voter_id) do update set choice_user_id=excluded.choice_user_id,created_at=now();
  select count(*) into cv from public.spike_battle_votes where battle_id=b.id and choice_user_id=b.creator_id;
  select count(*) into ov from public.spike_battle_votes where battle_id=b.id and choice_user_id=b.opponent_id;
  if cv+ov>=50 and abs(cv-ov)>=10 then winner:=case when cv>ov then b.creator_id else b.opponent_id end;
  else winner:=null; end if;
  if winner is not null then update public.spike_battles set status='closed',winner_id=winner,closed_at=now() where id=b.id; end if;
  return jsonb_build_object('ok',true,'creator_votes',cv,'opponent_votes',ov,'status',case when winner is null then 'open' else 'closed' end,'winner_id',winner);
end $$;

create or replace function public.spike_chain_create(p_title text,p_description text default '',p_root_post_id text default null,p_first_entry text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); cid uuid; eid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.spike_signal_chains(creator_id,root_post_id,title,description) values(uid,nullif(trim(p_root_post_id),''),trim(p_title),coalesce(trim(p_description),'')) returning id into cid;
  if nullif(trim(p_first_entry),'') is not null then insert into public.spike_signal_chain_entries(chain_id,user_id,content) values(cid,uid,trim(p_first_entry)) returning id into eid; end if;
  return jsonb_build_object('ok',true,'chain_id',cid,'entry_id',eid);
end $$;

create or replace function public.spike_chain_add_entry(p_chain_id uuid,p_parent_entry_id uuid,p_content text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); eid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.spike_signal_chains c where c.id=p_chain_id) then raise exception 'Chain not found'; end if;
  if p_parent_entry_id is not null and not exists(select 1 from public.spike_signal_chain_entries e where e.id=p_parent_entry_id and e.chain_id=p_chain_id) then raise exception 'Parent entry not found'; end if;
  insert into public.spike_signal_chain_entries(chain_id,parent_entry_id,user_id,content) values(p_chain_id,p_parent_entry_id,trim(p_content)) returning id into eid;
  return jsonb_build_object('ok',true,'entry_id',eid);
end $$;

create or replace function public.spike_chains_list()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(z.data order by z.created_at desc),'[]'::jsonb) from (select jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'creator_id',c.creator_id,'creator_name',coalesce(p.display_name,p.username,'SPIKE User'),'created_at',c.created_at,'entries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'parent_entry_id',e.parent_entry_id,'user_id',e.user_id,'user_name',coalesce(pe.display_name,pe.username,'SPIKE User'),'content',e.content,'created_at',e.created_at) order by e.created_at) from public.spike_signal_chain_entries e left join public.profiles pe on pe.id=e.user_id where e.chain_id=c.id),'[]'::jsonb)) as data, c.created_at from public.spike_signal_chains c left join public.profiles p on p.id=c.creator_id order by c.created_at desc limit 50) z;
$$;

create or replace function public.spike_missions_list()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'description',m.description,'target',m.target,'xp_reward',m.xp_reward,'max_participants',m.max_participants,'starts_at',m.starts_at,'ends_at',m.ends_at,'creator_id',m.creator_id,'creator_name',coalesce(p.display_name,p.username,'SPIKE User'),'participants',(select count(*) from public.spike_community_mission_members mm where mm.mission_id=m.id),'joined',exists(select 1 from public.spike_community_mission_members mm where mm.mission_id=m.id and mm.user_id=(select auth.uid())),'progress',coalesce((select mm.progress from public.spike_community_mission_members mm where mm.mission_id=m.id and mm.user_id=(select auth.uid())),0)), '[]'::jsonb) from public.spike_community_missions m left join public.profiles p on p.id=m.creator_id where m.active and m.ends_at>now() order by m.ends_at limit 50;
$$;

create or replace function public.spike_mission_create(p_title text,p_description text,p_target integer,p_xp_reward integer default 100,p_days integer default 7)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); mid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.spike_community_missions(creator_id,title,description,target,xp_reward,ends_at) values(uid,trim(p_title),coalesce(trim(p_description),''),least(greatest(p_target,1),100000),least(greatest(coalesce(p_xp_reward,100),0),10000),now()+make_interval(days=>least(greatest(coalesce(p_days,7),1),30))) returning id into mid;
  insert into public.spike_community_mission_members(mission_id,user_id) values(mid,uid);
  return jsonb_build_object('ok',true,'mission_id',mid);
end $$;

create or replace function public.spike_mission_join(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); cap int; n int;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select max_participants into cap from public.spike_community_missions where id=p_mission_id and active and ends_at>now();
  if cap is null then raise exception 'Mission not available'; end if;
  select count(*) into n from public.spike_community_mission_members where mission_id=p_mission_id;
  if n>=cap and not exists(select 1 from public.spike_community_mission_members where mission_id=p_mission_id and user_id=uid) then raise exception 'Mission is full'; end if;
  insert into public.spike_community_mission_members(mission_id,user_id) values(p_mission_id,uid) on conflict do nothing;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.spike_mission_progress(p_mission_id uuid,p_increment integer default 1)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); target int; xp int; oldp int; newp int; completed boolean:=false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select m.target,m.xp_reward into target,xp from public.spike_community_missions m join public.spike_community_mission_members mm on mm.mission_id=m.id and mm.user_id=uid where m.id=p_mission_id and m.active and m.ends_at>now();
  if target is null then raise exception 'Join an active mission first'; end if;
  select progress into oldp from public.spike_community_mission_members where mission_id=p_mission_id and user_id=uid for update;
  newp:=least(target,oldp+least(greatest(coalesce(p_increment,1),1),100));
  completed:=newp>=target and oldp<target;
  update public.spike_community_mission_members set progress=newp,completed_at=case when completed then now() else completed_at end where mission_id=p_mission_id and user_id=uid;
  if completed then perform public.spike_gamification_award(uid,xp,'community_mission',p_mission_id::text,'{}'::jsonb); end if;
  return jsonb_build_object('ok',true,'progress',newp,'target',target,'completed',completed,'xp_awarded',case when completed then xp else 0 end);
end $$;

create or replace function public.spike_seasons_hub()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('season', (select jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'starts_at',s.starts_at,'ends_at',s.ends_at,'status',s.status) from public.spike_seasons s where s.starts_at<=now() and s.ends_at>now() order by s.starts_at desc limit 1), 'leaderboard', coalesce((select jsonb_agg(z order by z.points desc) from (select sp.user_id,sp.points,coalesce(p.display_name,p.username,'SPIKE User') as display_name,p.username,p.avatar_url from public.spike_season_points sp join public.profiles p on p.id=sp.user_id where sp.season_id=(select s.id from public.spike_seasons s where s.starts_at<=now() and s.ends_at>now() order by s.starts_at desc limit 1) order by sp.points desc limit 50) z),'[]'::jsonb));
$$;

create or replace function public.spike_season_award_points(p_user_id uuid,p_points integer,p_source text default 'activity')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); sid uuid; after_points int;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id<>uid then raise exception 'Only the signed-in user can earn points'; end if;
  select id into sid from public.spike_seasons where starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if sid is null then return jsonb_build_object('ok',false,'reason','no_live_season'); end if;
  insert into public.spike_season_points(season_id,user_id,points) values(sid,uid,least(greatest(coalesce(p_points,0),0),1000)) on conflict(season_id,user_id) do update set points=public.spike_season_points.points+excluded.points,updated_at=now() returning points into after_points;
  return jsonb_build_object('ok',true,'points',after_points,'season_id',sid,'source',coalesce(p_source,'activity'));
end $$;

create or replace function public.spike_circles_list()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'privacy',c.privacy,'owner_id',c.owner_id,'owner_name',coalesce(p.display_name,p.username,'SPIKE User'),'members',(select count(*) from public.spike_circle_members cm where cm.circle_id=c.id),'joined',exists(select 1 from public.spike_circle_members cm where cm.circle_id=c.id and cm.user_id=(select auth.uid())),'created_at',c.created_at) order by c.created_at desc),'[]'::jsonb) from public.spike_circles c join public.profiles p on p.id=c.owner_id where c.privacy='discoverable' or exists(select 1 from public.spike_circle_members cm where cm.circle_id=c.id and cm.user_id=(select auth.uid()));
$$;

create or replace function public.spike_circle_create(p_name text,p_description text default '',p_privacy text default 'private')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_privacy not in ('private','discoverable') then raise exception 'Invalid privacy'; end if;
  insert into public.spike_circles(owner_id,name,description,privacy) values(uid,trim(p_name),coalesce(trim(p_description),''),p_privacy) returning id into cid;
  insert into public.spike_circle_members(circle_id,user_id,role) values(cid,uid,'owner');
  return jsonb_build_object('ok',true,'circle_id',cid);
end $$;

create or replace function public.spike_circle_join(p_circle_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); priv text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select privacy into priv from public.spike_circles where id=p_circle_id;
  if priv is null then raise exception 'Circle not found'; end if;
  if priv<>'discoverable' and not exists(select 1 from public.spike_circle_members where circle_id=p_circle_id and user_id=uid) then raise exception 'This Circle is private. Ask the owner to add you.'; end if;
  insert into public.spike_circle_members(circle_id,user_id) values(p_circle_id,uid) on conflict do nothing;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.spike_circle_leave(p_circle_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.spike_circle_members where circle_id=p_circle_id and user_id=uid and role='owner') then raise exception 'Circle owners cannot leave their Circle'; end if;
  delete from public.spike_circle_members where circle_id=p_circle_id and user_id=uid;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.spike_circle_messages_list(p_circle_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select case when exists(select 1 from public.spike_circle_members where circle_id=p_circle_id and user_id=(select auth.uid())) then coalesce((select jsonb_agg(z.data order by z.created_at desc) from (select jsonb_build_object('id',m.id,'user_id',m.user_id,'user_name',coalesce(p.display_name,p.username,'SPIKE User'),'avatar_url',p.avatar_url,'content',m.content,'created_at',m.created_at) as data, m.created_at from public.spike_circle_messages m join public.profiles p on p.id=m.user_id where m.circle_id=p_circle_id order by m.created_at desc limit 100) z),'[]'::jsonb) else '[]'::jsonb end;
$$;

create or replace function public.spike_circle_send_message(p_circle_id uuid,p_content text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); mid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.spike_circle_members where circle_id=p_circle_id and user_id=uid) then raise exception 'Join the Circle first'; end if;
  insert into public.spike_circle_messages(circle_id,user_id,content) values(p_circle_id,uid,trim(p_content)) returning id into mid;
  return jsonb_build_object('ok',true,'message_id',mid);
end $$;

-- Seed a first live season only if none exists; safe to re-run.
insert into public.spike_seasons(name,description,starts_at,ends_at,status)
select 'SEASON 01 · MAKE YOUR MARK','The first SPIKE season. Earn points by participating in Battles, Chains, Missions and Circles.',date_trunc('day',now()),date_trunc('day',now())+interval '30 days','live'
where not exists(select 1 from public.spike_seasons);

-- Keep all feature RPCs authenticated-only.
do $$ declare r text; begin
  foreach r in array array['spike_world_people(text)','spike_battles_list()','spike_battle_create(uuid,text,text,text,integer)','spike_battle_vote(uuid,uuid)','spike_chain_create(text,text,text,text)','spike_chain_add_entry(uuid,uuid,text)','spike_chains_list()','spike_missions_list()','spike_mission_create(text,text,integer,integer,integer)','spike_mission_join(uuid)','spike_mission_progress(uuid,integer)','spike_seasons_hub()','spike_season_award_points(uuid,integer,text)','spike_circles_list()','spike_circle_create(text,text,text)','spike_circle_join(uuid)','spike_circle_leave(uuid)','spike_circle_messages_list(uuid)','spike_circle_send_message(uuid,text)'] loop execute format('revoke execute on function public.%s from public,anon',r); execute format('grant execute on function public.%s to authenticated',r); end loop; end $$;

-- Deployment safety follow-up: invite support is in 20260906160000_spike_world_circle_invites_v1.sql.
