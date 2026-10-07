create or replace function public.room_update_picture(
  p_room_id uuid,
  p_avatar_url text
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_room public.rooms;
  v_url text := nullif(left(trim(coalesce(p_avatar_url,'')), 2000), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.rooms
     set avatar_url = v_url,
         updated_at = now()
   where id = p_room_id
     and owner_id = auth.uid()
     and active = true
   returning * into v_room;

  if v_room.id is null then
    raise exception 'Only the Room creator can change this Room picture';
  end if;

  return v_room;
end
$function$;

revoke all on function public.room_update_picture(uuid,text) from public;
grant execute on function public.room_update_picture(uuid,text) to authenticated;
