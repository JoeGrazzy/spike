-- SPIKE Rooms Phase 10: sender-scoped idempotency for text message delivery.
-- Additive only. Includes per-sender/per-room serialization for slow-mode correctness.

alter table public.room_messages
  add column if not exists client_message_id uuid;

create unique index if not exists room_messages_sender_client_message_id_uidx
  on public.room_messages (user_id, client_message_id)
  where client_message_id is not null;

create or replace function public.room_public_send_message_idempotent(
  p_room_id uuid,
  p_channel_id uuid,
  p_body text,
  p_reply_to_id uuid,
  p_client_message_id uuid
)
returns public.room_messages
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.room_messages;
  v_existing public.room_messages;
  v_slow integer := 0;
  v_last timestamptz;
  v_body text := left(trim(coalesce(p_body, '')), 500);
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_room_id is null or p_channel_id is null then raise exception 'room is not ready'; end if;
  if p_client_message_id is null then raise exception 'message request ID is required'; end if;
  if v_body = '' then raise exception 'message cannot be empty'; end if;
  if length(p_body) > 500 then raise exception 'message is too long'; end if;
  if not public.is_room_member(p_room_id) then raise exception 'room membership required'; end if;
  if not exists (select 1 from public.room_channels c where c.id=p_channel_id and c.room_id=p_room_id) then raise exception 'chat channel is invalid'; end if;
  if exists (select 1 from public.room_bans b where b.room_id=p_room_id and b.user_id=v_uid) then raise exception 'you are banned'; end if;
  if exists (select 1 from public.room_mutes m where m.room_id=p_room_id and m.user_id=v_uid and (m.expires_at is null or m.expires_at > now())) then raise exception 'you are muted'; end if;
  if coalesce((select rs.chat_locked from public.room_settings rs where rs.room_id=p_room_id),false) and not public.is_room_staff(p_room_id) then raise exception 'chat is locked'; end if;
  if p_reply_to_id is not null and not exists (select 1 from public.room_messages rm where rm.id=p_reply_to_id and rm.room_id=p_room_id) then raise exception 'reply target is invalid'; end if;

  -- Serialize requests sharing this sender-scoped key. This closes the race
  -- where two simultaneous retries both pass the first lookup.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_client_message_id::text, 0));

  -- Resolve a prior accepted request before slow-mode/rate-limit checks. This
  -- is what makes a retry safe after the server committed but the response was lost.
  select * into v_existing
  from public.room_messages
  where user_id=v_uid and client_message_id=p_client_message_id;
  if found then
    if v_existing.room_id <> p_room_id
       or v_existing.channel_id <> p_channel_id
       or v_existing.body <> v_body
       or v_existing.reply_to_id is distinct from p_reply_to_id then
      raise exception 'message request ID was already used for different content';
    end if;
    return v_existing;
  end if;

  -- Different message IDs from the same sender must also serialize within a
  -- room, otherwise two concurrent sends can both pass slow-mode checks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':' || p_room_id::text || ':room-send', 1)
  );

  select coalesce(rs.slow_mode_seconds,0) into v_slow
  from public.room_settings rs where rs.room_id=p_room_id;
  if v_slow > 0 and not public.is_room_staff(p_room_id) then
    select max(rm.created_at) into v_last
    from public.room_messages rm where rm.room_id=p_room_id and rm.user_id=v_uid;
    if v_last is not null and v_last > now() - make_interval(secs => v_slow) then
      raise exception 'slow mode: please wait before sending another message';
    end if;
  end if;

  if not public.room_rate_limit_check('message:'||p_room_id::text,30,60) then
    raise exception 'message rate limit exceeded';
  end if;

  insert into public.room_messages(room_id,channel_id,user_id,body,reply_to_id,client_message_id)
  values(p_room_id,p_channel_id,v_uid,v_body,p_reply_to_id,p_client_message_id)
  on conflict (user_id, client_message_id) where client_message_id is not null
  do nothing
  returning * into v_row;

  if v_row.id is not null then return v_row; end if;

  -- A concurrent retry may have inserted the same key after our first lookup.
  select * into v_existing from public.room_messages
  where user_id=v_uid and client_message_id=p_client_message_id;
  if not found then raise exception 'message could not be confirmed; retry safely'; end if;
  if v_existing.room_id <> p_room_id
     or v_existing.channel_id <> p_channel_id
     or v_existing.body <> v_body
     or v_existing.reply_to_id is distinct from p_reply_to_id then
    raise exception 'message request ID was already used for different content';
  end if;
  return v_existing;
end;
$function$;

revoke all on function public.room_public_send_message_idempotent(uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.room_public_send_message_idempotent(uuid,uuid,text,uuid,uuid) to authenticated;
