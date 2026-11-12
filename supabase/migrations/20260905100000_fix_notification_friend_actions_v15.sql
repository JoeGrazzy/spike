-- Robust notification actions: tolerate stale request IDs by resolving the current
-- pending request from the notification actor when supplied.
create or replace function public.accept_friend_request(p_request_id uuid, p_sender_id uuid default null)
returns public.friend_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r public.friend_requests;
declare actor_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into r from public.friend_requests where id=p_request_id and recipient_id=auth.uid() for update;
  if not found and p_sender_id is not null then
    select * into r from public.friend_requests
      where sender_id=p_sender_id and recipient_id=auth.uid() and status='pending'
      order by created_at desc limit 1 for update;
  end if;
  if not found then return null; end if;
  if r.status='pending' then
    update public.friend_requests set status='accepted', responded_at=now() where id=r.id returning * into r;
    insert into public.friendships(user_id,friend_id) values (r.sender_id,r.recipient_id),(r.recipient_id,r.sender_id) on conflict do nothing;
    select coalesce(display_name,username,'Someone') into actor_name from public.profiles where id=auth.uid();
    insert into public.notifications(user_id,type,data,priority,event_key,group_key)
    values (r.sender_id,'friend_accepted',jsonb_build_object('actor_id',auth.uid(),'actor_name',coalesce(actor_name,'Someone'),'request_id',r.id,'title','Friend request accepted','body',coalesce(actor_name,'Someone')||' accepted your friend request'),'normal','friend-accepted:'||r.id::text,'friendship:'||least(r.sender_id::text,r.recipient_id::text)||':'||greatest(r.sender_id::text,r.recipient_id::text))
    on conflict (user_id,event_key) where event_key is not null do nothing;
  end if;
  return r;
end; $$;

create or replace function public.decline_friend_request(p_request_id uuid, p_sender_id uuid default null)
returns public.friend_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r public.friend_requests;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into r from public.friend_requests where id=p_request_id and recipient_id=auth.uid() for update;
  if not found and p_sender_id is not null then
    select * into r from public.friend_requests
      where sender_id=p_sender_id and recipient_id=auth.uid() and status='pending'
      order by created_at desc limit 1 for update;
  end if;
  if not found then return null; end if;
  if r.status='pending' then update public.friend_requests set status='declined',responded_at=now() where id=r.id returning * into r; end if;
  return r;
end; $$;
revoke all on function public.accept_friend_request(uuid,uuid) from public,anon;
revoke all on function public.decline_friend_request(uuid,uuid) from public,anon;
grant execute on function public.accept_friend_request(uuid,uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid,uuid) to authenticated;
