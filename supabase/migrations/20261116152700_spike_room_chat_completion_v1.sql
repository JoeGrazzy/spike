-- SPIKE Rooms chat completion v1. Additive migration; preserves existing messages and room data.
alter table public.spike_room_messages
  add column if not exists reply_to_message_id uuid references public.spike_room_messages(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;

create index if not exists spike_room_messages_reply_idx
  on public.spike_room_messages(room_id, reply_to_message_id) where reply_to_message_id is not null;
create index if not exists spike_room_messages_pinned_idx
  on public.spike_room_messages(room_id, pinned_at desc) where pinned_at is not null and deleted_at is null;

create table if not exists public.spike_room_message_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  message_id uuid not null references public.spike_room_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment','hate','spam','sexual','violence','other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique(message_id, reporter_id)
);
create index if not exists spike_room_message_reports_review_idx
  on public.spike_room_message_reports(created_at desc, room_id);
alter table public.spike_room_message_reports enable row level security;
revoke all on table public.spike_room_message_reports from public, anon, authenticated;

create or replace function public.spike_room_send_reply(
  p_room_id uuid, p_body text, p_reply_to_message_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_message public.spike_room_messages;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_body),'') is null or char_length(btrim(p_body)) > 800 then raise exception 'Message must be 1–800 characters'; end if;
  if not exists (select 1 from public.spike_rooms r where r.id=p_room_id and r.allow_chat and r.status='live') then raise exception 'Room chat is unavailable'; end if;
  if not exists (select 1 from public.spike_room_members m where m.room_id=p_room_id and m.user_id=v_uid and m.member_state='active') then raise exception 'Join the room before chatting'; end if;
  if not exists (select 1 from public.spike_room_messages m where m.id=p_reply_to_message_id and m.room_id=p_room_id and m.deleted_at is null) then raise exception 'The message you are replying to is no longer available'; end if;
  insert into public.spike_room_messages(room_id,sender_id,body,reply_to_message_id)
  values(p_room_id,v_uid,btrim(p_body),p_reply_to_message_id) returning * into v_message;
  return to_jsonb(v_message);
end;
$function$;
revoke all on function public.spike_room_send_reply(uuid,text,uuid) from public, anon;
grant execute on function public.spike_room_send_reply(uuid,text,uuid) to authenticated;

create or replace function public.spike_room_toggle_pin(p_message_id uuid, p_pin boolean)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_room_id uuid; v_role text; v_message public.spike_room_messages;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select room_id into v_room_id from public.spike_room_messages where id=p_message_id and deleted_at is null for update;
  if not found then raise exception 'This message is no longer available'; end if;
  select role into v_role from public.spike_room_members where room_id=v_room_id and user_id=v_uid and member_state='active';
  if coalesce(v_role,'') not in ('host','cohost') then raise exception 'Only the host or a co-host can pin messages'; end if;
  update public.spike_room_messages set pinned_at=case when p_pin then now() else null end,
    pinned_by=case when p_pin then v_uid else null end
  where id=p_message_id returning * into v_message;
  return to_jsonb(v_message);
end;
$function$;
revoke all on function public.spike_room_toggle_pin(uuid,boolean) from public, anon;
grant execute on function public.spike_room_toggle_pin(uuid,boolean) to authenticated;

create or replace function public.spike_room_report_message(
  p_message_id uuid, p_reason text, p_details text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_room_id uuid; v_report_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_reason not in ('harassment','hate','spam','sexual','violence','other') then raise exception 'Choose a valid report reason'; end if;
  if char_length(coalesce(p_details,'')) > 500 then raise exception 'Details must be 500 characters or fewer'; end if;
  select room_id into v_room_id from public.spike_room_messages where id=p_message_id and deleted_at is null;
  if not found then raise exception 'This message is no longer available'; end if;
  if not exists (select 1 from public.spike_room_members where room_id=v_room_id and user_id=v_uid and member_state='active') then raise exception 'Join the room before reporting a message'; end if;
  insert into public.spike_room_message_reports(room_id,message_id,reporter_id,reason,details)
  values(v_room_id,p_message_id,v_uid,p_reason,btrim(coalesce(p_details,'')))
  on conflict(message_id,reporter_id) do update set reason=excluded.reason,details=excluded.details,created_at=now()
  returning id into v_report_id;
  return jsonb_build_object('ok',true,'report_id',v_report_id);
end;
$function$;
revoke all on function public.spike_room_report_message(uuid,text,text) from public, anon;
grant execute on function public.spike_room_report_message(uuid,text,text) to authenticated;

-- Extended host settings: room visibility, speaker requests and capacity.
create or replace function public.spike_room_update_settings_v2(
  p_room_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_allow_chat boolean,
  p_allow_speaker_requests boolean,
  p_max_participants integer
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_active_count integer; v_room public.spike_rooms;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_title),'') is null or char_length(btrim(p_title)) not between 4 and 80 then raise exception 'Room name must be 4–80 characters'; end if;
  if char_length(coalesce(p_description,'')) > 500 then raise exception 'Description must be 500 characters or fewer'; end if;
  if p_visibility not in ('public','private') then raise exception 'Choose public or private room access'; end if;
  if p_max_participants not between 2 and 100 then raise exception 'Room capacity must be between 2 and 100'; end if;
  perform 1 from public.spike_rooms where id=p_room_id and active_host_id=v_uid and status in ('live','scheduled') for update;
  if not found then raise exception 'Only the active room host can update room settings'; end if;
  select count(*) into v_active_count from public.spike_room_members where room_id=p_room_id and member_state='active';
  if p_max_participants < v_active_count then raise exception 'Capacity cannot be lower than the current number of participants'; end if;
  update public.spike_rooms set title=btrim(p_title), description=btrim(coalesce(p_description,'')),
    visibility=p_visibility, allow_chat=coalesce(p_allow_chat,true),
    allow_speaker_requests=coalesce(p_allow_speaker_requests,true),
    max_participants=p_max_participants, updated_at=now()
  where id=p_room_id and active_host_id=v_uid and status in ('live','scheduled')
  returning * into v_room;
  if not found then raise exception 'Only the active room host can update room settings'; end if;
  return jsonb_build_object('ok',true,'title',v_room.title,'description',v_room.description,
    'visibility',v_room.visibility,'allow_chat',v_room.allow_chat,
    'allow_speaker_requests',v_room.allow_speaker_requests,'max_participants',v_room.max_participants);
end;
$function$;
revoke all on function public.spike_room_update_settings_v2(uuid,text,text,text,boolean,boolean,integer) from public, anon;
grant execute on function public.spike_room_update_settings_v2(uuid,text,text,text,boolean,boolean,integer) to authenticated;
