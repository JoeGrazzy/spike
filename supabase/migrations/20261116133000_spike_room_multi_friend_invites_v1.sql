-- SPIKE Rooms: secure multi-friend invitations and native notification delivery.
-- Additive migration. Existing room membership, chat, wallet and one-to-one calls are unchanged.

create or replace function public.spike_room_send_invites(
  p_room_id uuid,
  p_invitee_ids uuid[]
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_uid uuid := auth.uid();
  v_room public.spike_rooms;
  v_invitee uuid;
  v_invite_id uuid;
  v_sent integer := 0;
  v_skipped integer := 0;
  v_inviter_name text;
  v_inviter_avatar text;
  v_ids uuid[] := array[]::uuid[];
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_room_id is null then raise exception 'Choose a room first'; end if;
  if coalesce(cardinality(p_invitee_ids),0) < 1 then raise exception 'Select at least one friend'; end if;
  if cardinality(p_invitee_ids) > 100 then raise exception 'You can invite up to 100 friends at once'; end if;

  select * into v_room from public.spike_rooms where id=p_room_id;
  if not found or v_room.status='ended' then raise exception 'This room is no longer available'; end if;
  if not exists (
    select 1 from public.spike_room_members m
    where m.room_id=p_room_id and m.user_id=v_uid and m.member_state='active'
      and m.role in ('host','cohost')
  ) then raise exception 'Only the host or co-host can invite people'; end if;

  select coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),'A SPIKE friend'), p.avatar_url
    into v_inviter_name, v_inviter_avatar
  from public.profiles p where p.id=v_uid;
  v_inviter_name := coalesce(v_inviter_name,'A SPIKE friend');

  for v_invitee in
    select distinct x from unnest(p_invitee_ids) as t(x) where x is not null
  loop
    v_invite_id := null;
    if v_invitee=v_uid
      or not exists(select 1 from public.profiles p where p.id=v_invitee)
      or not exists(select 1 from public.friendships f
        where (f.user_id=v_uid and f.friend_id=v_invitee)
           or (f.user_id=v_invitee and f.friend_id=v_uid))
      or exists(select 1 from public.private_message_blocks b
        where (b.blocker_id=v_uid and b.blocked_id=v_invitee)
           or (b.blocker_id=v_invitee and b.blocked_id=v_uid))
      or exists(select 1 from public.spike_room_members m
        where m.room_id=p_room_id and m.user_id=v_invitee and m.member_state='active')
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.spike_room_invites(room_id,inviter_id,invitee_id,status,created_at,responded_at)
    values(p_room_id,v_uid,v_invitee,'pending',now(),null)
    on conflict(room_id,invitee_id) do update
      set inviter_id=excluded.inviter_id,status='pending',created_at=now(),responded_at=null
      where public.spike_room_invites.status in ('declined','revoked')
    returning id into v_invite_id;

    if v_invite_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.notifications(user_id,type,data,priority)
    values(
      v_invitee,
      'room_invite',
      jsonb_build_object(
        'title','Room invitation',
        'message',v_inviter_name || ' invited you to join ' || v_room.title || '.',
        'actor_id',v_uid,
        'actor_name',v_inviter_name,
        'actor_avatar',v_inviter_avatar,
        'room_id',p_room_id,
        'room_title',v_room.title,
        'invite_id',v_invite_id,
        'invite_status','pending',
        'url','rooms.html'
      ),
      'high'
    );
    v_sent := v_sent + 1;
    v_ids := array_append(v_ids,v_invite_id);
  end loop;

  return jsonb_build_object('ok',true,'sent_count',v_sent,'skipped_count',v_skipped,'invite_ids',to_jsonb(v_ids));
end;
$function$;

-- Active room hosts and co-hosts can see pending invitations to avoid duplicates.
drop policy if exists spike_room_invites_read_room_moderators on public.spike_room_invites;
create policy spike_room_invites_read_room_moderators on public.spike_room_invites
for select to authenticated
using (exists (
  select 1 from public.spike_room_members m
  where m.room_id=spike_room_invites.room_id and m.user_id=(select auth.uid())
    and m.member_state='active' and m.role in ('host','cohost')
));

-- Keep the single-invite RPC compatible with older clients while ensuring it
-- produces the same first-class notification as the batch flow.
create or replace function public.spike_room_send_invite(p_room_id uuid,p_invitee_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
  v_id uuid;
begin
  v_result := public.spike_room_send_invites(p_room_id,array[p_invitee_id]);
  if coalesce((v_result->>'sent_count')::integer,0) <> 1 then
    raise exception 'This friend already has an invitation, is already in the room, or cannot be invited';
  end if;
  v_id := (v_result->'invite_ids'->>0)::uuid;
  return v_id;
end;
$function$;

create or replace function public.spike_room_respond_invite(p_invite_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_uid uuid := auth.uid(); v_room_id uuid; v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  update public.spike_room_invites
    set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
    where id=p_invite_id and invitee_id=v_uid and status='pending'
    returning room_id,status into v_room_id,v_status;
  if not found then raise exception 'Invitation is no longer available'; end if;
  if p_accept then perform public.spike_rooms_join(v_room_id); end if;
  update public.notifications
    set data=coalesce(data,'{}'::jsonb) || jsonb_build_object('invite_status',v_status)
    where user_id=v_uid and type='room_invite' and data->>'invite_id'=p_invite_id::text;
  return jsonb_build_object('ok',true,'room_id',v_room_id,'accepted',coalesce(p_accept,false));
end;
$function$;

revoke all on function public.spike_room_send_invites(uuid,uuid[]) from public,anon;
revoke all on function public.spike_room_send_invite(uuid,uuid) from public,anon;
revoke all on function public.spike_room_respond_invite(uuid,boolean) from public,anon;
grant execute on function public.spike_room_send_invites(uuid,uuid[]) to authenticated;
grant execute on function public.spike_room_send_invite(uuid,uuid) to authenticated;
grant execute on function public.spike_room_respond_invite(uuid,boolean) to authenticated;
