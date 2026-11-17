-- SPIKE Rooms lifecycle v2: separate room ownership from the active host.
-- Rooms stay live when their creator leaves; chat rows are never deleted by leaving.
alter table public.spike_rooms
  add column if not exists active_host_id uuid references auth.users(id) on delete set null,
  add column if not exists empty_since timestamptz;

update public.spike_rooms
set active_host_id = host_id
where active_host_id is null
  and status in ('live','scheduled');

create index if not exists spike_rooms_active_host_idx
  on public.spike_rooms(active_host_id,status,created_at desc);

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
  insert into public.spike_rooms(host_id,active_host_id,title,description,category,visibility,status,max_participants,allow_chat,allow_speaker_requests,scheduled_at,started_at)
  values(v_uid,v_uid,btrim(p_title),coalesce(btrim(p_description),''),coalesce(p_category,'General'),coalesce(p_visibility,'public'),v_status,coalesce(p_max_participants,50),coalesce(p_allow_chat,true),coalesce(p_allow_speaker_requests,true),p_scheduled_at,case when p_scheduled_at is null then now() else null end)
  returning id into v_room_id;
  insert into public.spike_room_members(room_id,user_id,role,member_state)
  values(v_room_id,v_uid,'host','active');
  return v_room_id;
end;
$function$;

create or replace function public.spike_rooms_join(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_uid uuid := auth.uid();
  v_room public.spike_rooms;
  v_existing public.spike_room_members;
  v_count integer;
  v_active_host uuid;
  v_has_membership boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.spike_rooms where id=p_room_id for update;
  if not found or v_room.status='ended' then raise exception 'This room is no longer available'; end if;
  if private.spike_user_is_restricted(v_uid) then raise exception 'Your account is restricted from joining rooms'; end if;
  if exists (
    select 1 from public.private_message_blocks b
    where (b.blocker_id=v_uid and b.blocked_id=v_room.host_id)
       or (b.blocker_id=v_room.host_id and b.blocked_id=v_uid)
  ) then raise exception 'You cannot join this room'; end if;
  if exists (
    select 1 from public.spike_room_members m
    join public.private_message_blocks b
      on ((b.blocker_id=v_uid and b.blocked_id=m.user_id)
       or (b.blocker_id=m.user_id and b.blocked_id=v_uid))
    where m.room_id=p_room_id and m.member_state='active'
  ) then raise exception 'You cannot join a room with someone you have blocked or who has blocked you'; end if;

  select * into v_existing from public.spike_room_members
  where room_id=p_room_id and user_id=v_uid;
  v_has_membership := found;
  if v_has_membership and v_existing.member_state in ('banned','removed') then
    raise exception 'You are not allowed to rejoin this room';
  end if;
  if v_room.visibility='private'
     and v_uid<>v_room.host_id
     and not exists(select 1 from public.spike_room_invites i where i.room_id=p_room_id and i.invitee_id=v_uid and i.status='accepted')
     and not v_has_membership then
    raise exception 'This is a private room. You need an accepted invitation';
  end if;
  select count(*) into v_count from public.spike_room_members m
  where m.room_id=p_room_id and m.member_state='active';
  if (not v_has_membership or v_existing.member_state is distinct from 'active')
     and v_count >= v_room.max_participants then
    raise exception 'This room is full';
  end if;

  v_active_host := v_room.active_host_id;
  if v_active_host is null then v_active_host := v_uid; end if;

  insert into public.spike_room_members as existing_member(room_id,user_id,role,member_state,joined_at,left_at,speaker_requested)
  values(
    p_room_id,v_uid,
    case when v_active_host=v_uid then 'host'
         when v_has_membership and v_existing.role='cohost' then 'cohost'
         else 'listener' end,
    'active',now(),null,false
  )
  on conflict(room_id,user_id) do update
    set member_state='active',
        joined_at=now(),
        left_at=null,
        speaker_requested=false,
        role=case
          when v_active_host=v_uid then 'host'
          when existing_member.role='cohost' then 'cohost'
          else 'listener'
        end,
        updated_at=now()
    where public.spike_room_members.member_state not in ('banned','removed');

  update public.spike_rooms
  set active_host_id=v_active_host,empty_since=null,updated_at=now()
  where id=p_room_id;

  return jsonb_build_object('ok',true,'room_id',p_room_id,'status',v_room.status,'active_host_id',v_active_host);
end;
$function$;

create or replace function public.spike_rooms_leave(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_uid uuid := auth.uid();
  v_room public.spike_rooms;
  v_member public.spike_room_members;
  v_next_host uuid;
  v_remaining integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.spike_rooms where id=p_room_id for update;
  if not found or v_room.status='ended' then raise exception 'This room is no longer active'; end if;
  select * into v_member from public.spike_room_members
  where room_id=p_room_id and user_id=v_uid for update;
  if not found or v_member.member_state<>'active' then
    raise exception 'You are not currently in this room';
  end if;

  update public.spike_room_members
  set member_state='left',left_at=now(),speaker_requested=false,updated_at=now()
  where room_id=p_room_id and user_id=v_uid;

  if v_room.active_host_id=v_uid or v_member.role='host' then
    select m.user_id into v_next_host
    from public.spike_room_members m
    where m.room_id=p_room_id
      and m.member_state='active'
      and m.user_id<>v_uid
    order by case m.role when 'cohost' then 0 when 'speaker' then 1 else 2 end,
             m.joined_at asc
    limit 1
    for update;

    if v_next_host is not null then
      update public.spike_room_members
      set role='host',speaker_requested=false,updated_at=now()
      where room_id=p_room_id and user_id=v_next_host and member_state='active';
      update public.spike_rooms
      set active_host_id=v_next_host,empty_since=null,updated_at=now()
      where id=p_room_id;
    else
      update public.spike_rooms
      set active_host_id=null,empty_since=coalesce(empty_since,now()),updated_at=now()
      where id=p_room_id;
    end if;
  else
    select count(*) into v_remaining from public.spike_room_members
    where room_id=p_room_id and member_state='active';
    if v_remaining=0 then
      update public.spike_rooms
      set active_host_id=null,empty_since=coalesce(empty_since,now()),updated_at=now()
      where id=p_room_id;
    end if;
  end if;

  return jsonb_build_object('ok',true,'room_id',p_room_id,'room_stays_live',true,'new_active_host_id',v_next_host);
end;
$function$;

create or replace function public.spike_rooms_start(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.spike_rooms
  set status='live',started_at=now(),empty_since=null,updated_at=now()
  where id=p_room_id and active_host_id=v_uid and status='scheduled';
  if not found then raise exception 'Only the active room host can start a scheduled room'; end if;
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
  update public.spike_rooms
  set status='ended',ended_at=now(),active_host_id=null,empty_since=null,updated_at=now()
  where id=p_room_id and active_host_id=v_uid and status in ('live','scheduled');
  if not found then raise exception 'Only the active room host can end this room'; end if;
  update public.spike_room_members
  set member_state='left',left_at=now(),speaker_requested=false,updated_at=now()
  where room_id=p_room_id and member_state='active';
  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.spike_rooms_create(text,text,text,text,timestamptz,integer,boolean,boolean) from public,anon;
revoke all on function public.spike_rooms_join(uuid) from public,anon;
revoke all on function public.spike_rooms_leave(uuid) from public,anon;
revoke all on function public.spike_rooms_start(uuid) from public,anon;
revoke all on function public.spike_rooms_end(uuid) from public,anon;
grant execute on function public.spike_rooms_create(text,text,text,text,timestamptz,integer,boolean,boolean) to authenticated;
grant execute on function public.spike_rooms_join(uuid) to authenticated;
grant execute on function public.spike_rooms_leave(uuid) to authenticated;
grant execute on function public.spike_rooms_start(uuid) to authenticated;
grant execute on function public.spike_rooms_end(uuid) to authenticated;
