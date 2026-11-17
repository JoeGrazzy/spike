-- Route room-message reports into SPIKE's existing moderation queue.
create or replace function public.spike_room_report_message(
  p_message_id uuid, p_reason text, p_details text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_message public.spike_room_messages;
  v_report_id uuid;
  v_case_id uuid;
  v_case_details text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_reason not in ('harassment','hate','spam','sexual','violence','other') then
    raise exception 'Choose a valid report reason';
  end if;
  if char_length(coalesce(p_details,'')) > 500 then
    raise exception 'Details must be 500 characters or fewer';
  end if;
  select * into v_message
  from public.spike_room_messages
  where id=p_message_id and deleted_at is null;
  if not found then raise exception 'This message is no longer available'; end if;
  if not exists (
    select 1 from public.spike_room_members
    where room_id=v_message.room_id and user_id=v_uid and member_state='active'
  ) then raise exception 'Join the room before reporting a message'; end if;

  insert into public.spike_room_message_reports(room_id,message_id,reporter_id,reason,details)
  values(v_message.room_id,v_message.id,v_uid,p_reason,btrim(coalesce(p_details,'')))
  on conflict(message_id,reporter_id) do update
    set reason=excluded.reason,details=excluded.details,created_at=now()
  returning id into v_report_id;

  v_case_details := left(
    'Room message ID: ' || v_message.id::text ||
    E'\nReported message: ' || left(v_message.body,1200) ||
    case when nullif(btrim(coalesce(p_details,'')),'') is null then ''
         else E'\nReporter notes: ' || btrim(p_details) end,
    3000
  );

  insert into public.spike_abuse_cases(
    reporter_id,subject_user_id,source,source_id,category,details
  )
  select v_uid,v_message.sender_id,'room',v_message.room_id::text,p_reason,v_case_details
  where not exists (
    select 1 from public.spike_abuse_cases a
    where a.reporter_id=v_uid
      and a.source='room'
      and a.source_id=v_message.room_id::text
      and a.category=p_reason
      and a.status in ('open','reviewing')
      and position(('Room message ID: ' || v_message.id::text) in coalesce(a.details,'')) > 0
  )
  returning id into v_case_id;

  return jsonb_build_object(
    'ok',true,'report_id',v_report_id,'moderation_case_id',v_case_id
  );
end;
$function$;
revoke all on function public.spike_room_report_message(uuid,text,text) from public, anon;
grant execute on function public.spike_room_report_message(uuid,text,text) to authenticated;
