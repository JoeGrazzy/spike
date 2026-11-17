-- SPIKE Rooms message actions v1. Additive only; existing room and wallet data is preserved.

alter table public.spike_room_messages
  add column if not exists edited_at timestamptz;

create table if not exists public.spike_room_message_reactions (
  message_id uuid not null references public.spike_room_messages(id) on delete cascade,
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('👍','❤️','😂','🔥','👏')),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,reaction)
);

create index if not exists spike_room_message_reactions_room_idx
  on public.spike_room_message_reactions(room_id,message_id);

alter table public.spike_room_message_reactions enable row level security;
revoke all on table public.spike_room_message_reactions from public,anon,authenticated;
grant select on table public.spike_room_message_reactions to authenticated;

drop policy if exists spike_room_message_reactions_read_members
  on public.spike_room_message_reactions;
create policy spike_room_message_reactions_read_members
  on public.spike_room_message_reactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.spike_room_members m
      where m.room_id = spike_room_message_reactions.room_id
        and m.user_id = (select auth.uid())
        and m.member_state = 'active'
    )
  );

create or replace function public.spike_room_get_reactions(
  p_message_ids uuid[]
) returns table(message_id uuid,user_id uuid,reaction text)
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_room_count integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(p_message_ids),0) = 0 or cardinality(p_message_ids) > 60 then
    raise exception 'Choose up to 60 room messages';
  end if;
  select count(distinct m.room_id), (array_agg(distinct m.room_id))[1]
    into v_room_count, v_room_id
  from public.spike_room_messages m
  where m.id = any(p_message_ids) and m.deleted_at is null;
  if v_room_count <> 1 then raise exception 'Messages must belong to one active room'; end if;
  if not exists (
    select 1 from public.spike_room_members m
    where m.room_id = v_room_id and m.user_id = v_uid and m.member_state = 'active'
  ) then raise exception 'Join the room before viewing reactions'; end if;
  return query
    select r.message_id,r.user_id,r.reaction
    from public.spike_room_message_reactions r
    where r.room_id = v_room_id and r.message_id = any(p_message_ids);
end;
$function$;

revoke all on function public.spike_room_get_reactions(uuid[]) from public,anon;
grant execute on function public.spike_room_get_reactions(uuid[]) to authenticated;

create or replace function public.spike_room_edit_message(
  p_message_id uuid,
  p_body text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_message public.spike_room_messages;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_body),'') is null or char_length(btrim(p_body)) > 800 then
    raise exception 'Message must be 1–800 characters';
  end if;
  select * into v_message
  from public.spike_room_messages
  where id = p_message_id and deleted_at is null
  for update;
  if not found then raise exception 'This message is no longer available'; end if;
  if v_message.sender_id <> v_uid then raise exception 'You can only edit your own messages'; end if;
  if not exists (
    select 1 from public.spike_room_members m
    where m.room_id = v_message.room_id and m.user_id = v_uid
      and m.member_state = 'active'
  ) then raise exception 'Join the room before editing messages'; end if;
  if not exists (
    select 1 from public.spike_rooms r
    where r.id = v_message.room_id and r.status = 'live' and r.allow_chat
  ) then raise exception 'Room chat is unavailable'; end if;
  update public.spike_room_messages
  set body = btrim(p_body), edited_at = now()
  where id = p_message_id
  returning * into v_message;
  return to_jsonb(v_message);
end;
$function$;

create or replace function public.spike_room_delete_message(
  p_message_id uuid
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_message public.spike_room_messages;
  v_role text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_message
  from public.spike_room_messages
  where id = p_message_id and deleted_at is null
  for update;
  if not found then raise exception 'This message is no longer available'; end if;
  select m.role into v_role
  from public.spike_room_members m
  where m.room_id = v_message.room_id and m.user_id = v_uid
    and m.member_state = 'active';
  if not found then raise exception 'Join the room before deleting messages'; end if;
  if v_message.sender_id <> v_uid and coalesce(v_role,'') not in ('host','cohost') then
    raise exception 'Only the message author or a room moderator can delete this message';
  end if;
  update public.spike_room_messages
  set deleted_at = now(), edited_at = now(), body = 'Message deleted'
  where id = p_message_id;
  delete from public.spike_room_message_reactions where message_id = p_message_id;
  return jsonb_build_object('ok',true,'message_id',p_message_id);
end;
$function$;

create or replace function public.spike_room_react_message(
  p_message_id uuid,
  p_reaction text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_removed boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if coalesce(p_reaction,'') not in ('👍','❤️','😂','🔥','👏') then
    raise exception 'Unsupported room reaction';
  end if;
  select room_id into v_room_id
  from public.spike_room_messages
  where id = p_message_id and deleted_at is null
  for update;
  if not found then raise exception 'This message is no longer available'; end if;
  if not exists (
    select 1 from public.spike_room_members m
    where m.room_id = v_room_id and m.user_id = v_uid
      and m.member_state = 'active'
  ) then raise exception 'Join the room before reacting'; end if;
  if exists (
    select 1 from public.spike_room_message_reactions r
    where r.message_id = p_message_id and r.user_id = v_uid
      and r.reaction = p_reaction
  ) then
    delete from public.spike_room_message_reactions
    where message_id = p_message_id and user_id = v_uid and reaction = p_reaction;
    v_removed := true;
  else
    insert into public.spike_room_message_reactions(message_id,room_id,user_id,reaction)
    values(p_message_id,v_room_id,v_uid,p_reaction)
    on conflict(message_id,user_id,reaction) do nothing;
  end if;
  return jsonb_build_object('ok',true,'removed',v_removed,'message_id',p_message_id,'reaction',p_reaction);
end;
$function$;

create or replace function public.spike_room_update_settings(
  p_room_id uuid,
  p_title text,
  p_description text,
  p_allow_chat boolean
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_active_count integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_title),'') is null or char_length(btrim(p_title)) not between 4 and 80 then
    raise exception 'Room name must be 4–80 characters';
  end if;
  if char_length(coalesce(p_description,'')) > 500 then
    raise exception 'Room description must be 500 characters or fewer';
  end if;
  select count(*) into v_active_count from public.spike_room_members
  where room_id = p_room_id and member_state = 'active';
  update public.spike_rooms
  set title = btrim(p_title), description = coalesce(btrim(p_description),''),
      allow_chat = coalesce(p_allow_chat,true), updated_at = now()
  where id = p_room_id and active_host_id = v_uid and status in ('live','scheduled');
  if not found then raise exception 'Only the active room host can update room settings'; end if;
  return jsonb_build_object('ok',true,'active_participants',v_active_count,
    'title',btrim(p_title),'description',coalesce(btrim(p_description),''),'allow_chat',coalesce(p_allow_chat,true));
end;
$function$;

revoke all on function public.spike_room_update_settings(uuid,text,text,boolean) from public,anon;
grant execute on function public.spike_room_update_settings(uuid,text,text,boolean) to authenticated;

create or replace function public.spike_room_transfer_host(
  p_room_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_target_state text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id = v_uid then raise exception 'Choose another room participant'; end if;
  perform 1 from public.spike_rooms where id = p_room_id and active_host_id = v_uid and status in ('live','scheduled') for update;
  if not found then raise exception 'Only the active room host can transfer hosting'; end if;
  select member_state into v_target_state
  from public.spike_room_members
  where room_id = p_room_id and user_id = p_user_id
  for update;
  if not found or v_target_state <> 'active' then raise exception 'Choose an active room participant'; end if;
  update public.spike_room_members
  set role = 'cohost', speaker_requested = false, updated_at = now()
  where room_id = p_room_id and user_id = v_uid and member_state = 'active';
  update public.spike_room_members
  set role = 'host', speaker_requested = false, updated_at = now()
  where room_id = p_room_id and user_id = p_user_id and member_state = 'active';
  update public.spike_rooms
  set active_host_id = p_user_id, updated_at = now()
  where id = p_room_id;
  return jsonb_build_object('ok',true,'active_host_id',p_user_id);
end;
$function$;

revoke all on function public.spike_room_transfer_host(uuid,uuid) from public,anon;
grant execute on function public.spike_room_transfer_host(uuid,uuid) to authenticated;

revoke all on function public.spike_room_edit_message(uuid,text) from public,anon;
revoke all on function public.spike_room_delete_message(uuid) from public,anon;
revoke all on function public.spike_room_react_message(uuid,text) from public,anon;
grant execute on function public.spike_room_edit_message(uuid,text) to authenticated;
grant execute on function public.spike_room_delete_message(uuid) to authenticated;
grant execute on function public.spike_room_react_message(uuid,text) to authenticated;
