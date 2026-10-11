CREATE OR REPLACE FUNCTION public.send_friend_request(p_user_id uuid)
RETURNS public.friend_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  r public.friend_requests;
  reverse_id uuid;
  actor_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'invalid recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'user not found'; end if;
  if exists (select 1 from public.friendships where (user_id=auth.uid() and friend_id=p_user_id) or (user_id=p_user_id and friend_id=auth.uid())) then raise exception 'already friends'; end if;

  select id into reverse_id from public.friend_requests
  where sender_id = p_user_id and recipient_id = auth.uid() and status = 'pending'
  limit 1;

  if reverse_id is not null then
    update public.friend_requests set status='accepted', responded_at=now() where id=reverse_id returning * into r;
    insert into public.friendships(user_id, friend_id)
    values (r.sender_id, r.recipient_id), (r.recipient_id, r.sender_id)
    on conflict do nothing;

    select coalesce(display_name, username, 'Someone') into actor_name from public.profiles where id=auth.uid();
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values (
      r.sender_id,
      'friend_accepted',
      jsonb_build_object('actor_id',auth.uid(),'actor_name',coalesce(actor_name,'Someone'),'request_id',r.id,'title','Friend request accepted','body',coalesce(actor_name,'Someone') || ' accepted your friend request'),
      'normal',
      'friend-accepted:' || r.id::text,
      'friendship:' || least(r.sender_id::text,r.recipient_id::text) || ':' || greatest(r.sender_id::text,r.recipient_id::text)
    )
    on conflict (user_id,event_key) where event_key is not null do nothing;
    return r;
  end if;

  insert into public.friend_requests(sender_id,recipient_id,status)
  values(auth.uid(),p_user_id,'pending')
  on conflict(sender_id,recipient_id) do update
    set status='pending', responded_at=null, created_at=now()
  returning * into r;

  select coalesce(display_name, username, 'Someone') into actor_name from public.profiles where id=auth.uid();
  insert into public.notifications(user_id,type,data,priority,event_key,group_key)
  values (
    p_user_id,
    'friend_request',
    jsonb_build_object('actor_id',auth.uid(),'actor_name',coalesce(actor_name,'Someone'),'request_id',r.id,'title','Friend request','body',coalesce(actor_name,'Someone') || ' sent you a friend request'),
    'high',
    'friend-request:' || r.id::text,
    'friend-request:' || p_user_id::text
  )
  on conflict (user_id,event_key) where event_key is not null do nothing;

  return r;
end;
$function$;
