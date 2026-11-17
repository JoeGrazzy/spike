-- SPIKE Rooms rebuild v1. Additive only: no retired room objects are restored,
-- and no existing wallet, private-message, profile, or one-to-one call objects are changed.

create table if not exists public.spike_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 4 and 80),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'General' check (category in ('Music','Entertainment','Education','Business','Relationships','Technology','Sports','Lifestyle','General')),
  visibility text not null default 'public' check (visibility in ('public','private')),
  status text not null default 'live' check (status in ('scheduled','live','ended')),
  cover_url text,
  max_participants integer not null default 50 check (max_participants between 2 and 100),
  allow_chat boolean not null default true,
  allow_speaker_requests boolean not null default true,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spike_rooms_schedule_check check (
    (status <> 'scheduled' or scheduled_at is not null)
  )
);

create table if not exists public.spike_room_members (
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'listener' check (role in ('host','cohost','speaker','listener')),
  member_state text not null default 'active' check (member_state in ('active','left','removed','banned')),
  is_muted boolean not null default false,
  speaker_requested boolean not null default false,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create table if not exists public.spike_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 800),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.spike_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (room_id,invitee_id)
);

create table if not exists public.spike_room_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment','hate','spam','sexual','violence','other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (room_id,reporter_id)
);

create index if not exists spike_rooms_discovery_idx on public.spike_rooms(status,visibility,created_at desc);
create index if not exists spike_rooms_host_idx on public.spike_rooms(host_id,status,created_at desc);
create index if not exists spike_room_members_user_idx on public.spike_room_members(user_id,member_state,joined_at desc);
create index if not exists spike_room_messages_room_time_idx on public.spike_room_messages(room_id,created_at desc) where deleted_at is null;
create index if not exists spike_room_invites_inbox_idx on public.spike_room_invites(invitee_id,status,created_at desc);

alter table public.spike_rooms enable row level security;
alter table public.spike_room_members enable row level security;
alter table public.spike_room_messages enable row level security;
alter table public.spike_room_invites enable row level security;
alter table public.spike_room_reports enable row level security;

revoke all on table public.spike_rooms, public.spike_room_members, public.spike_room_messages,
  public.spike_room_invites, public.spike_room_reports from public, anon, authenticated;
grant select on table public.spike_rooms, public.spike_room_members,
  public.spike_room_messages, public.spike_room_invites to authenticated;

 create or replace function public.spike_room_is_active_member(p_room_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.spike_room_members m
    where m.room_id=p_room_id and m.user_id=auth.uid() and m.member_state='active'
  );
$function$;
revoke all on function public.spike_room_is_active_member(uuid) from public,anon;
grant execute on function public.spike_room_is_active_member(uuid) to authenticated;

drop policy if exists spike_rooms_read_visible on public.spike_rooms;
create policy spike_rooms_read_visible on public.spike_rooms
for select to authenticated
using (
  (visibility = 'public' and status in ('live','scheduled'))
  or host_id = (select auth.uid())
  or public.spike_room_is_active_member(id)
  or exists (
    select 1 from public.spike_room_invites i
    where i.room_id = id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
  )
);

drop policy if exists spike_room_members_read_room_participants on public.spike_room_members;
create policy spike_room_members_read_room_participants on public.spike_room_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.spike_room_is_active_member(room_id)
);

drop policy if exists spike_room_messages_read_members on public.spike_room_messages;
create policy spike_room_messages_read_members on public.spike_room_messages
for select to authenticated
using (
  public.spike_room_is_active_member(room_id)
);

drop policy if exists spike_room_invites_read_participants on public.spike_room_invites;
create policy spike_room_invites_read_participants on public.spike_room_invites
for select to authenticated
using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));

-- No direct browser writes to room tables. All state changes go through the
-- authenticated, validation-checked RPCs below.

create or replace function public.spike_rooms_create(
  p_title text,
  p_description text default '',
  p_category text default 'General',
  p_visibility text default 'public',
  p_scheduled_at timestamptz default null,
  p_max_participants integer default 50,
  p_allow_chat boolean default true,
  p_allow_speaker_requests boolean default true
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_room_id uuid; v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_title),'') is null or char_length(btrim(p_title)) < 4 or char_length(btrim(p_title)) > 80 then raise exception 'Room name must be 4–80 characters'; end if;
  if coalesce(char_length(p_description),0) > 500 then raise exception 'Room description is too long'; end if;
  if coalesce(p_category,'General') not in ('Music','Entertainment','Education','Business','Relationships','Technology','Sports','Lifestyle','General') then raise exception 'Invalid room category'; end if;
  if coalesce(p_visibility,'public') not in ('public','private') then raise exception 'Invalid room access'; end if;
  if coalesce(p_max_participants,50) not between 2 and 100 then raise exception 'Participant limit must be between 2 and 100'; end if;
  if p_scheduled_at is not null and (p_scheduled_at < now() + interval '1 minute' or p_scheduled_at > now() + interval '30 days') then raise exception 'Choose a start time within the next 30 days'; end if;
  if private.spike_user_is_restricted(v_uid) then raise exception 'Your account is temporarily restricted from creating rooms'; end if;
  v_status := case when p_scheduled_at is not null then 'scheduled' else 'live' end;
  insert into public.spike_rooms(host_id,title,description,category,visibility,status,max_participants,allow_chat,allow_speaker_requests,scheduled_at,started_at)
  values(v_uid,btrim(p_title),coalesce(btrim(p_description),''),coalesce(p_category,'General'),coalesce(p_visibility,'public'),v_status,coalesce(p_max_participants,50),coalesce(p_allow_chat,true),coalesce(p_allow_speaker_requests,true),p_scheduled_at,case when p_scheduled_at is null then now() else null end)
  returning id into v_room_id;
  insert into public.spike_room_members(room_id,user_id,role,member_state) values(v_room_id,v_uid,'host','active');
  return v_room_id;
end;
$function$;

create or replace function public.spike_rooms_discover(p_limit integer default 60)
returns table(
  id uuid, host_id uuid, title text, description text, category text, visibility text,
  status text, cover_url text, max_participants integer, allow_chat boolean,
  allow_speaker_requests boolean, scheduled_at timestamptz, created_at timestamptz,
  host_display_name text, host_username text, host_avatar_url text, participant_count bigint
)
language sql stable security definer
set search_path = pg_catalog, public, private
as $function$
  select r.id,r.host_id,r.title,r.description,r.category,r.visibility,r.status,r.cover_url,
    r.max_participants,r.allow_chat,r.allow_speaker_requests,r.scheduled_at,r.created_at,
    p.display_name,p.username,p.avatar_url,
    (select count(*) from public.spike_room_members m where m.room_id=r.id and m.member_state='active')::bigint
  from public.spike_rooms r
  join public.profiles p on p.id=r.host_id
  where auth.uid() is not null
    and r.visibility='public' and r.status in ('live','scheduled')
    and public.can_discover_spike_profile(auth.uid(),r.host_id)
    and not private.spike_user_is_restricted(r.host_id)
    and not exists (
      select 1 from public.private_message_blocks b
      where (b.blocker_id=auth.uid() and b.blocked_id=r.host_id)
         or (b.blocker_id=r.host_id and b.blocked_id=auth.uid())
    )
  order by case when r.status='live' then 0 else 1 end, r.created_at desc
  limit greatest(1,least(coalesce(p_limit,60),100));
$function$;

create or replace function public.spike_rooms_join(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_room public.spike_rooms; v_existing public.spike_room_members; v_count integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.spike_rooms where id=p_room_id for update;
  if not found or v_room.status='ended' then raise exception 'This room is no longer available'; end if;
  if private.spike_user_is_restricted(v_uid) then raise exception 'Your account is restricted from joining rooms'; end if;
  if exists (select 1 from public.private_message_blocks b where (b.blocker_id=v_uid and b.blocked_id=v_room.host_id) or (b.blocker_id=v_room.host_id and b.blocked_id=v_uid)) then raise exception 'You cannot join this room'; end if;
  if exists (select 1 from public.spike_room_members m join public.private_message_blocks b on ((b.blocker_id=v_uid and b.blocked_id=m.user_id) or (b.blocker_id=m.user_id and b.blocked_id=v_uid)) where m.room_id=p_room_id and m.member_state='active') then raise exception 'You cannot join a room with someone you have blocked or who has blocked you'; end if;
  select * into v_existing from public.spike_room_members where room_id=p_room_id and user_id=v_uid;
  if found and v_existing.member_state in ('banned','removed') then raise exception 'You are not allowed to rejoin this room'; end if;
  if v_room.visibility='private' and v_uid<>v_room.host_id and not exists(select 1 from public.spike_room_invites i where i.room_id=p_room_id and i.invitee_id=v_uid and i.status='accepted') then raise exception 'This is a private room. You need an accepted invitation'; end if;
  select count(*) into v_count from public.spike_room_members m where m.room_id=p_room_id and m.member_state='active';
  if v_existing.member_state is distinct from 'active' and v_count >= v_room.max_participants then raise exception 'This room is full'; end if;
  insert into public.spike_room_members(room_id,user_id,role,member_state,joined_at,left_at,speaker_requested)
  values(p_room_id,v_uid,case when v_uid=v_room.host_id then 'host' else 'listener' end,'active',now(),null,false)
  on conflict(room_id,user_id) do update set member_state='active',joined_at=now(),left_at=null,speaker_requested=false,
    role=case when public.spike_room_members.role in ('host','cohost') then public.spike_room_members.role else 'listener' end,
    updated_at=now()
  where public.spike_room_members.member_state not in ('banned','removed');
  return jsonb_build_object('ok',true,'room_id',p_room_id,'status',v_room.status);
end;
$function$;

create or replace function public.spike_rooms_leave(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.spike_rooms r where r.id=p_room_id and r.host_id=v_uid and r.status<>'ended') then raise exception 'The host must end the room or transfer ownership before leaving'; end if;
  update public.spike_room_members set member_state='left',left_at=now(),speaker_requested=false,updated_at=now()
  where room_id=p_room_id and user_id=v_uid and member_state='active';
  if not found then raise exception 'You are not currently in this room'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.spike_room_request_speaker(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.spike_rooms r where r.id=p_room_id and r.status='live' and r.allow_speaker_requests) then raise exception 'Speaking requests are not available in this room'; end if;
  update public.spike_room_members set speaker_requested=true,updated_at=now()
  where room_id=p_room_id and user_id=v_uid and member_state='active' and role='listener';
  if not found then raise exception 'Only active listeners can request to speak'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.spike_room_moderate_member(p_room_id uuid,p_user_id uuid,p_action text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_actor_role text; v_target_role text; v_target_state text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select role into v_actor_role from public.spike_room_members where room_id=p_room_id and user_id=v_uid and member_state='active';
  if coalesce(v_actor_role,'') not in ('host','cohost') then raise exception 'Only the host or a co-host can moderate this room'; end if;
  select role,member_state into v_target_role,v_target_state from public.spike_room_members where room_id=p_room_id and user_id=p_user_id for update;
  if not found or v_target_state<>'active' or p_user_id=v_uid then raise exception 'Participant is not available for this action'; end if;
  if v_target_role='host' or (v_actor_role='cohost' and v_target_role='cohost') then raise exception 'You do not have permission to moderate this participant'; end if;
  if p_action='speaker' then
    update public.spike_room_members set role='speaker',speaker_requested=false,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
  elsif p_action='demote' then
    if v_actor_role<>'host' then raise exception 'Only the host can change speaker roles'; end if;
    update public.spike_room_members set role='listener',speaker_requested=false,updated_at=now() where room_id=p_room_id and user_id=p_user_id and role='speaker';
  elsif p_action='cohost' then
    if v_actor_role<>'host' then raise exception 'Only the host can appoint a co-host'; end if;
    update public.spike_room_members set role='cohost',speaker_requested=false,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
  elsif p_action='mute' then
    update public.spike_room_members set is_muted=true,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
  elsif p_action='unmute' then
    update public.spike_room_members set is_muted=false,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
  elsif p_action='remove' then
    update public.spike_room_members set member_state='removed',left_at=now(),speaker_requested=false,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
  elsif p_action='ban' then
    update public.spike_room_members set member_state='banned',left_at=now(),speaker_requested=false,updated_at=now() where room_id=p_room_id and user_id=p_user_id;
  else raise exception 'Unsupported moderation action';
  end if;
  return jsonb_build_object('ok',true,'action',p_action);
end;
$function$;

create or replace function public.spike_rooms_start(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.spike_rooms set status='live',started_at=now(),updated_at=now()
  where id=p_room_id and host_id=v_uid and status='scheduled';
  if not found then raise exception 'Only the host can start a scheduled room'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.spike_rooms_end(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.spike_rooms set status='ended',ended_at=now(),updated_at=now()
  where id=p_room_id and host_id=v_uid and status in ('live','scheduled');
  if not found then raise exception 'Only the host can end this room'; end if;
  update public.spike_room_members set member_state='left',left_at=now(),speaker_requested=false,updated_at=now()
  where room_id=p_room_id and member_state='active';
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.spike_room_send_message(p_room_id uuid,p_body text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_message public.spike_room_messages;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_body),'') is null or char_length(btrim(p_body))>800 then raise exception 'Message must be 1–800 characters'; end if;
  if not exists(select 1 from public.spike_rooms r where r.id=p_room_id and r.allow_chat and r.status='live') then raise exception 'Room chat is unavailable'; end if;
  if not exists(select 1 from public.spike_room_members m where m.room_id=p_room_id and m.user_id=v_uid and m.member_state='active') then raise exception 'Join the room before chatting'; end if;
  insert into public.spike_room_messages(room_id,sender_id,body) values(p_room_id,v_uid,btrim(p_body)) returning * into v_message;
  return to_jsonb(v_message);
end;
$function$;

create or replace function public.spike_room_send_invite(p_room_id uuid,p_invitee_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_invite_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_invitee_id is null or p_invitee_id=v_uid then raise exception 'Choose another SPIKE member'; end if;
  if not exists(select 1 from public.spike_room_members m where m.room_id=p_room_id and m.user_id=v_uid and m.member_state='active' and m.role in ('host','cohost')) then raise exception 'Only the host or co-host can invite people'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_invitee_id) then raise exception 'SPIKE member not found'; end if;
  if exists(select 1 from public.private_message_blocks b where (b.blocker_id=v_uid and b.blocked_id=p_invitee_id) or (b.blocker_id=p_invitee_id and b.blocked_id=v_uid)) then raise exception 'You cannot invite this member'; end if;
  insert into public.spike_room_invites(room_id,inviter_id,invitee_id,status,created_at,responded_at)
  values(p_room_id,v_uid,p_invitee_id,'pending',now(),null)
  on conflict(room_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='pending',created_at=now(),responded_at=null
  returning id into v_invite_id;
  return v_invite_id;
end;
$function$;

create or replace function public.spike_room_respond_invite(p_invite_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_room_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.spike_room_invites set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
  where id=p_invite_id and invitee_id=v_uid and status='pending' returning room_id into v_room_id;
  if not found then raise exception 'Invitation is no longer available'; end if;
  if p_accept then perform public.spike_rooms_join(v_room_id); end if;
  return jsonb_build_object('ok',true,'room_id',v_room_id,'accepted',coalesce(p_accept,false));
end;
$function$;

create or replace function public.spike_room_report(p_room_id uuid,p_reason text,p_details text default '')
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_reason not in ('harassment','hate','spam','sexual','violence','other') then raise exception 'Choose a valid report reason'; end if;
  if coalesce(char_length(p_details),0)>500 then raise exception 'Report details are too long'; end if;
  if not exists(select 1 from public.spike_rooms r where r.id=p_room_id) then raise exception 'Room not found'; end if;
  insert into public.spike_room_reports(room_id,reporter_id,reason,details)
  values(p_room_id,v_uid,p_reason,coalesce(btrim(p_details),'')) returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.spike_room_is_active_member(uuid) from public,anon;
revoke all on function public.spike_rooms_create(text,text,text,text,timestamptz,integer,boolean,boolean) from public,anon;
revoke all on function public.spike_rooms_discover(integer) from public,anon;
revoke all on function public.spike_rooms_join(uuid) from public,anon;
revoke all on function public.spike_rooms_leave(uuid) from public,anon;
revoke all on function public.spike_room_request_speaker(uuid) from public,anon;
revoke all on function public.spike_room_moderate_member(uuid,uuid,text) from public,anon;
revoke all on function public.spike_rooms_start(uuid) from public,anon;
revoke all on function public.spike_rooms_end(uuid) from public,anon;
revoke all on function public.spike_room_send_message(uuid,text) from public,anon;
revoke all on function public.spike_room_send_invite(uuid,uuid) from public,anon;
revoke all on function public.spike_room_respond_invite(uuid,boolean) from public,anon;
revoke all on function public.spike_room_report(uuid,text,text) from public,anon;
grant execute on function public.spike_room_is_active_member(uuid) to authenticated;
grant execute on function public.spike_rooms_create(text,text,text,text,timestamptz,integer,boolean,boolean) to authenticated;
grant execute on function public.spike_rooms_discover(integer) to authenticated;
grant execute on function public.spike_rooms_join(uuid) to authenticated;
grant execute on function public.spike_rooms_leave(uuid) to authenticated;
grant execute on function public.spike_room_request_speaker(uuid) to authenticated;
grant execute on function public.spike_room_moderate_member(uuid,uuid,text) to authenticated;
grant execute on function public.spike_rooms_start(uuid) to authenticated;
grant execute on function public.spike_rooms_end(uuid) to authenticated;
grant execute on function public.spike_room_send_message(uuid,text) to authenticated;
grant execute on function public.spike_room_send_invite(uuid,uuid) to authenticated;
grant execute on function public.spike_room_respond_invite(uuid,boolean) to authenticated;
grant execute on function public.spike_room_report(uuid,text,text) to authenticated;

-- Private Realtime channel authorization. Never make room channels public.
drop policy if exists spike_rooms_realtime_read_members_v1 on realtime.messages;
create policy spike_rooms_realtime_read_members_v1 on realtime.messages
for select to authenticated
using (
  extension in ('broadcast','presence')
  and exists (
    select 1 from public.spike_room_members m
    where m.user_id=(select auth.uid()) and m.member_state='active'
      and (select realtime.topic()) = 'spike-room:' || m.room_id::text
  )
);

drop policy if exists spike_rooms_realtime_write_members_v1 on realtime.messages;
create policy spike_rooms_realtime_write_members_v1 on realtime.messages
for insert to authenticated
with check (
  extension in ('broadcast','presence')
  and exists (
    select 1 from public.spike_room_members m
    where m.user_id=(select auth.uid()) and m.member_state='active'
      and (select realtime.topic()) = 'spike-room:' || m.room_id::text
  )
);
