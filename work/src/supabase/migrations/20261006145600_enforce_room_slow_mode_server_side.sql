create or replace function public.room_public_send_message(p_room_id uuid, p_channel_id uuid, p_body text, p_reply_to_id uuid default null::uuid)
returns public.room_messages
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.room_messages;
  v_slow integer := 0;
  v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_room_id is null or p_channel_id is null then raise exception 'room is not ready'; end if;
  if btrim(coalesce(p_body,'')) = '' then raise exception 'message cannot be empty'; end if;
  if length(p_body) > 500 then raise exception 'message is too long'; end if;
  if not public.is_room_member(p_room_id) then raise exception 'room membership required'; end if;
  if not exists (select 1 from public.room_channels c where c.id=p_channel_id and c.room_id=p_room_id) then raise exception 'chat channel is invalid'; end if;
  if exists (select 1 from public.room_bans b where b.room_id=p_room_id and b.user_id=auth.uid()) then raise exception 'you are banned'; end if;
  if exists (select 1 from public.room_mutes m where m.room_id=p_room_id and m.user_id=auth.uid() and (m.expires_at is null or m.expires_at > now())) then raise exception 'you are muted'; end if;
  if coalesce((select rs.chat_locked from public.room_settings rs where rs.room_id=p_room_id),false) and not public.is_room_staff(p_room_id) then raise exception 'chat is locked'; end if;
  if p_reply_to_id is not null and not exists (select 1 from public.room_messages rm where rm.id=p_reply_to_id and rm.room_id=p_room_id) then raise exception 'reply target is invalid'; end if;

  select coalesce(rs.slow_mode_seconds,0) into v_slow
  from public.room_settings rs
  where rs.room_id=p_room_id;

  if v_slow > 0 and not public.is_room_staff(p_room_id) then
    select max(rm.created_at) into v_last
    from public.room_messages rm
    where rm.room_id=p_room_id
      and rm.user_id=auth.uid();

    if v_last is not null and v_last > now() - make_interval(secs => v_slow) then
      raise exception 'slow mode: please wait before sending another message';
    end if;
  end if;

  if not public.room_rate_limit_check('message:'||p_room_id::text,30,60) then raise exception 'message rate limit exceeded'; end if;

  insert into public.room_messages(room_id,channel_id,user_id,body,reply_to_id)
  values(p_room_id,p_channel_id,auth.uid(),left(trim(p_body),500),p_reply_to_id)
  returning * into v_row;
  return v_row;
end;
$function$;
