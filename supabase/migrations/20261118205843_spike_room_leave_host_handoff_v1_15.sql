create or replace function private.leave_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_next_host uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and user_id = v_user_id
      and left_at is null
  ) then
    raise exception 'You are not an active member of this room' using errcode = '42501';
  end if;

  if v_room.active_host_id = v_user_id then
    select rm.user_id into v_next_host
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id <> v_user_id
      and rm.left_at is null
    order by
      case rm.member_role
        when 'moderator' then 1
        when 'speaker' then 2
        when 'listener' then 3
        else 4
      end,
      rm.joined_at asc
    limit 1
    for update;

    if v_next_host is null then
      update public.rooms
      set status = 'ended',
          ended_at = coalesce(ended_at, now())
      where id = p_room_id
        and status in ('scheduled', 'live');
    else
      update public.rooms
      set active_host_id = v_next_host
      where id = p_room_id;

      update public.room_members
      set member_role = 'host'
      where room_id = p_room_id
        and user_id = v_next_host
        and left_at is null;
    end if;
  end if;

  update public.room_members
  set left_at = now()
  where room_id = p_room_id
    and user_id = v_user_id
    and left_at is null;

  return found;
end;
$function$;

revoke all on function private.leave_room(uuid) from public, anon;
grant execute on function private.leave_room(uuid) to authenticated;

create or replace function public.spike_rooms_leave(p_room_id uuid)
returns boolean
language sql
set search_path = pg_catalog, public, private
as $function$
  select private.leave_room(p_room_id);
$function$;

revoke all on function public.spike_rooms_leave(uuid) from public, anon;
grant execute on function public.spike_rooms_leave(uuid) to authenticated;
