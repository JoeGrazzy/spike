create schema if not exists private;

create or replace function private.emit_notification(
  p_user_id uuid,
  p_type text,
  p_data jsonb default '{}'::jsonb,
  p_priority text default 'normal',
  p_event_key text default null,
  p_group_key text default null,
  p_expires_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or p_user_id = auth.uid() and false then return; end if;
  if p_type is null or btrim(p_type) = '' then return; end if;
  insert into public.notifications(user_id,type,data,priority,event_key,group_key,expires_at)
  values(p_user_id,btrim(p_type),coalesce(p_data,'{}'::jsonb),
    case when p_priority in ('critical','high','normal','low') then p_priority else 'normal' end,
    nullif(p_event_key,''),nullif(p_group_key,''),p_expires_at)
  on conflict (user_id,event_key) where event_key is not null do nothing;
exception when others then
  -- Notifications must never break the business transaction that caused them.
  raise warning '[SPIKE notification emitter] %', sqlerrm;
end;
$$;
revoke all on function private.emit_notification(uuid,text,jsonb,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function private.emit_notification(uuid,text,jsonb,text,text,text,timestamptz) to postgres, service_role;

-- Friend requests: pending request, accepted friendship, declined request.
create or replace function private.trg_friend_request_notifications() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; begin
  if tg_op='INSERT' and new.status='pending' then
    select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.sender_id;
    perform private.emit_notification(new.recipient_id,'friend_request',jsonb_build_object('actor_id',new.sender_id,'actor_name',actor,'request_id',new.id,'title','Friend request','body',coalesce(actor,'Someone')||' sent you a friend request'),'high','friend-request:'||new.id::text,'friend-request:'||new.recipient_id::text,null);
  elsif tg_op='UPDATE' and old.status='pending' and new.status='declined' then
    select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.recipient_id;
    perform private.emit_notification(new.sender_id,'friend_declined',jsonb_build_object('actor_id',new.recipient_id,'actor_name',actor,'request_id',new.id,'title','Friend request declined','body',coalesce(actor,'Someone')||' declined your friend request'),'normal','friend-declined:'||new.id::text,'friendship:'||least(new.sender_id::text,new.recipient_id::text)||':'||greatest(new.sender_id::text,new.recipient_id::text),null);
  end if; return coalesce(new,old);
end; $$;
drop trigger if exists trg_spike_friend_request_notifications on public.friend_requests;
create trigger trg_spike_friend_request_notifications after insert or update of status on public.friend_requests for each row execute function private.trg_friend_request_notifications();

create or replace function private.trg_friendship_notifications() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; k text; begin
  k:='friend-accepted:'||least(new.user_id::text,new.friend_id::text)||':'||greatest(new.user_id::text,new.friend_id::text);
  select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.user_id;
  perform private.emit_notification(new.friend_id,'friend_accepted',jsonb_build_object('actor_id',new.user_id,'actor_name',actor,'title','Friend request accepted','body',coalesce(actor,'Someone')||' accepted your friend request'),'normal',k,'friendship:'||least(new.user_id::text,new.friend_id::text)||':'||greatest(new.user_id::text,new.friend_id::text),null);
  return new;
end; $$;
drop trigger if exists trg_spike_friendship_notifications on public.friendships;
create trigger trg_spike_friendship_notifications after insert on public.friendships for each row execute function private.trg_friendship_notifications();

-- Private messages.
create or replace function private.trg_private_message_notifications() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; preview text; begin
  if new.sender_id=new.recipient_id or new.deleted_at is not null then return new; end if;
  select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.sender_id;
  preview=left(coalesce(nullif(new.body,''),'Sent a message'),180);
  perform private.emit_notification(new.recipient_id,'message',jsonb_build_object('actor_id',new.sender_id,'actor_name',actor,'message_id',new.id,'conversation_id',new.sender_id,'body',preview,'title','New message'),'normal','message:'||new.id::text,'conversation:'||least(new.sender_id::text,new.recipient_id::text)||':'||greatest(new.sender_id::text,new.recipient_id::text),null);
  return new;
end; $$;
drop trigger if exists trg_spike_private_message_notifications on public.private_messages;
create trigger trg_spike_private_message_notifications after insert on public.private_messages for each row execute function private.trg_private_message_notifications();

-- Private calls: incoming call immediately; missed/ended state updates later.
create or replace function private.trg_private_call_notifications() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; begin
  select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.caller_id;
  if tg_op='INSERT' then
    perform private.emit_notification(new.callee_id,'call_incoming',jsonb_build_object('actor_id',new.caller_id,'actor_name',actor,'call_id',new.id,'call_type',new.call_type,'title','Incoming call'),'high','call-incoming:'||new.id::text,null,null);
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status in ('missed','no_answer','rejected') then
      perform private.emit_notification(new.caller_id,'call_missed',jsonb_build_object('actor_id',new.callee_id,'call_id',new.id,'call_type',new.call_type,'title','Missed call'),'normal','call-missed:'||new.id::text,null,null);
    elsif new.status in ('ended','completed') then
      perform private.emit_notification(new.caller_id,'call_ended',jsonb_build_object('actor_id',new.callee_id,'call_id',new.id,'call_type',new.call_type,'title','Call ended'),'low','call-ended:'||new.id::text,null,null);
    end if;
  end if; return new;
end; $$;
drop trigger if exists trg_spike_private_call_notifications on public.private_calls;
create trigger trg_spike_private_call_notifications after insert or update of status on public.private_calls for each row execute function private.trg_private_call_notifications();

-- Comments on posts, plus direct @mentions when the mentioned username exists.
create or replace function private.trg_comment_notifications() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; actor text; uname text; mentioned uuid; begin
  select owner_id into owner from public.app_documents where collection_name='posts' and document_id=new.post_id limit 1;
  if owner is not null and owner<>new.user_id then
    select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.user_id;
    perform private.emit_notification(owner,'comment',jsonb_build_object('actor_id',new.user_id,'actor_name',actor,'post_id',new.post_id,'comment_id',new.id,'body',left(new.content,180),'title','New comment'),'normal','comment:'||new.id::text,'post:'||new.post_id,null);
  end if;
  for uname in select distinct m[1] from regexp_matches(coalesce(new.content,''),'@([A-Za-z0-9_.-]{2,64})','gi') as m loop
    select id into mentioned from public.profiles where lower(username)=lower(uname) limit 1;
    if mentioned is not null and mentioned<>new.user_id then
      select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.user_id;
      perform private.emit_notification(mentioned,'mention',jsonb_build_object('actor_id',new.user_id,'actor_name',actor,'post_id',new.post_id,'comment_id',new.id,'body',left(new.content,180),'title','You were mentioned'),'high','mention-comment:'||new.id::text||':'||mentioned::text,'post:'||new.post_id||':mentions',null);
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists trg_spike_comment_notifications on public.comments;
create trigger trg_spike_comment_notifications after insert on public.comments for each row execute function private.trg_comment_notifications();

-- Wallet activity: notify the owner for positive user-facing credits.
create or replace function private.trg_coin_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if new.amount>0 then perform private.emit_notification(new.user_id,case when new.type ilike '%topup%' then 'coin_topup_completed' else 'coin_received' end,jsonb_build_object('amount',new.amount,'coins',new.amount,'transaction_id',new.id,'reference_id',new.reference_id,'title','Coins received'),'normal','coin:'||new.id::text,null,null); end if; return new; end; $$;
drop trigger if exists trg_spike_coin_notifications on public.coin_transactions;
create trigger trg_spike_coin_notifications after insert on public.coin_transactions for each row execute function private.trg_coin_notification();

create or replace function private.trg_gem_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if new.amount>0 then perform private.emit_notification(new.user_id,'gem_received',jsonb_build_object('amount',new.amount,'transaction_id',new.id,'reference_id',new.reference_id,'title','Gems received'),'normal','gem:'||new.id::text,null,null); end if; return new; end; $$;
drop trigger if exists trg_spike_gem_notifications on public.gem_transactions;
create trigger trg_spike_gem_notifications after insert on public.gem_transactions for each row execute function private.trg_gem_notification();

-- Room purchases: only notify the purchaser when an admin/payment decision changes.
create or replace function private.trg_room_purchase_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if tg_op='UPDATE' and old.status is distinct from new.status and new.status in ('approved','verified','rejected','failed') then
    perform private.emit_notification(new.user_id,case when new.status in ('approved','verified') then 'room_purchase_verified' else 'room_purchase_rejected' end,jsonb_build_object('room_id',new.room_id,'item_id',new.item_id,'item_name',new.item_name,'purchase_id',new.id,'status',new.status,'body',coalesce(new.admin_note,''),'title',case when new.status in ('approved','verified') then 'Purchase approved' else 'Purchase rejected' end),'high','room-purchase:'||new.id::text||':'||new.status,null,null);
  end if; return new;
end; $$;
drop trigger if exists trg_spike_room_purchase_notifications on public.room_purchase_requests;
create trigger trg_spike_room_purchase_notifications after update of status on public.room_purchase_requests for each row execute function private.trg_room_purchase_notification();

-- Announcements explicitly addressed to users.
create or replace function private.trg_announcement_recipient_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; begin
  select title,body,severity into a from public.announcements where id=new.campaign_id;
  perform private.emit_notification(new.user_id,'announcement',jsonb_build_object('title',coalesce(a.title,'SPIKE announcement'),'body',coalesce(a.body,''),'announcement_id',new.campaign_id),'high','announcement:'||new.campaign_id::text||':'||new.user_id::text,null,null);
  return new;
end; $$;
drop trigger if exists trg_spike_announcement_recipient_notifications on public.announcement_recipients;
create trigger trg_spike_announcement_recipient_notifications after insert on public.announcement_recipients for each row execute function private.trg_announcement_recipient_notification();

-- Room-wide user alerts for new announcements/events/polls, excluding the creator.
create or replace function private.trg_room_broadcast_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare m record; title text; body text; typ text; rid uuid; eid text; begin
  if tg_table_name='room_announcements' then rid=new.room_id; typ='room_announcement'; title='Room announcement'; body=coalesce(new.body,''); eid=new.id::text;
  elsif tg_table_name='room_events' then rid=new.room_id; typ='room_event'; title=coalesce(new.title,'Room event'); body=coalesce(new.description,''); eid=new.id::text;
  elsif tg_table_name='room_polls' then rid=new.room_id; typ='room_poll'; title='New room poll'; body=coalesce(new.question,''); eid=new.id::text;
  else return new; end if;
  for m in select user_id from public.room_members where room_id=rid and active=true and user_id<>coalesce(new.created_by, new.created_by) loop
    perform private.emit_notification(m.user_id,typ,jsonb_build_object('room_id',rid,'room_name',null,'event_id',case when typ='room_event' then eid end,'poll_id',case when typ='room_poll' then eid end,'title',title,'body',left(body,240),'actor_id',new.created_by),'normal',typ||':'||eid||':'||m.user_id::text,'room:'||rid::text,null);
  end loop; return new;
end; $$;
drop trigger if exists trg_spike_room_announcement_notifications on public.room_announcements;
create trigger trg_spike_room_announcement_notifications after insert on public.room_announcements for each row execute function private.trg_room_broadcast_notification();
drop trigger if exists trg_spike_room_event_notifications on public.room_events;
create trigger trg_spike_room_event_notifications after insert on public.room_events for each row execute function private.trg_room_broadcast_notification();
drop trigger if exists trg_spike_room_poll_notifications on public.room_polls;
create trigger trg_spike_room_poll_notifications after insert on public.room_polls for each row execute function private.trg_room_broadcast_notification();

-- Story reactions/views: notify the story owner, not the viewer/reacter.
create or replace function private.trg_story_activity_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; actor text; sid uuid; typ text; key text; begin
  sid=new.story_id;
  select owner_id into owner from public.app_documents where collection_name='stories' and document_id=sid::text limit 1;
  if owner is null or owner=new.user_id then return new; end if;
  select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.user_id;
  typ=case when tg_table_name='story_reactions' then 'story_reaction' else 'story_view' end;
  key=typ||':'||sid::text||':'||new.user_id::text;
  perform private.emit_notification(owner,typ,jsonb_build_object('actor_id',new.user_id,'actor_name',actor,'story_id',sid,'reaction',case when tg_table_name='story_reactions' then new.reaction else null end,'title',case when typ='story_reaction' then 'Story reaction' else 'Story view' end),'normal',key,'story:'||sid::text,null);
  return new;
end; $$;
drop trigger if exists trg_spike_story_reaction_notifications on public.story_reactions;
create trigger trg_spike_story_reaction_notifications after insert on public.story_reactions for each row execute function private.trg_story_activity_notification();
drop trigger if exists trg_spike_story_view_notifications on public.story_views;
create trigger trg_spike_story_view_notifications after insert on public.story_views for each row execute function private.trg_story_activity_notification();

-- The notification table is read through its own authenticated RPCs; do not allow clients to manufacture arbitrary alerts.
revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Make the notification stream available to Supabase Realtime once, without disturbing other publication members.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then
  raise warning 'supabase_realtime publication is unavailable; enable it before relying on live notification delivery.';
end $$;

-- Remove the old client-side friend-request emission so friendships are the single source of truth for acceptance alerts.
create or replace function public.send_friend_request(p_user_id uuid)
returns public.friend_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.friend_requests; reverse_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'invalid recipient'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'user not found'; end if;
  if exists(select 1 from public.friendships where (user_id=auth.uid() and friend_id=p_user_id) or (user_id=p_user_id and friend_id=auth.uid())) then raise exception 'already friends'; end if;
  select id into reverse_id from public.friend_requests where sender_id=p_user_id and recipient_id=auth.uid() and status='pending' limit 1;
  if reverse_id is not null then
    update public.friend_requests set status='accepted',responded_at=now() where id=reverse_id returning * into r;
    insert into public.friendships(user_id,friend_id) values(r.sender_id,r.recipient_id),(r.recipient_id,r.sender_id) on conflict do nothing;
    return r;
  end if;
  insert into public.friend_requests(sender_id,recipient_id,status) values(auth.uid(),p_user_id,'pending') on conflict(sender_id,recipient_id) do update set status='pending',responded_at=null,created_at=now() returning * into r;
  return r;
end; $$;
