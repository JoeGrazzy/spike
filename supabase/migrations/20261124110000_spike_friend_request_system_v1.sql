-- SPIKE friend request system (QR-first)
-- Scan QR → send pending request → other person accepts/declines on friends.html
-- Mutual accepted follows = friends. No public follow graph.

create or replace function public.spike_send_friend_request(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_blocked boolean := false;
  v_out public.follows%rowtype;
  v_in public.follows%rowtype;
begin
  if v_me is null then raise exception 'Sign in to send a friend request.'; end if;
  if p_target_user_id is null then raise exception 'Invalid SPIKE member.'; end if;
  if p_target_user_id = v_me then raise exception 'You cannot send a request to yourself.'; end if;

  select * into v_target from public.profiles where id = p_target_user_id;
  if not found then raise exception 'This SPIKE member was not found.'; end if;
  if coalesce(v_target.account_status, 'active') <> 'active' then
    raise exception 'This account is unavailable.';
  end if;

  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_target_user_id)
       or (b.blocker_id = p_target_user_id and b.blocked_id = v_me)
  ) into v_blocked;
  if v_blocked then raise exception 'You cannot connect with this member.'; end if;

  select * into v_out from public.follows
  where follower_id = v_me and following_id = p_target_user_id;
  select * into v_in from public.follows
  where follower_id = p_target_user_id and following_id = v_me;

  -- Already friends
  if v_out.status = 'accepted' and v_in.status = 'accepted' then
    return jsonb_build_object('ok', true, 'state', 'friends', 'message', 'You are already SPIKE friends.');
  end if;

  -- They already sent you a request → accept both ways
  if v_in.status = 'pending' then
    delete from public.follows
    where (follower_id = v_me and following_id = p_target_user_id)
       or (follower_id = p_target_user_id and following_id = v_me);
    insert into public.follows (follower_id, following_id, status) values
      (v_me, p_target_user_id, 'accepted'),
      (p_target_user_id, v_me, 'accepted');
    return jsonb_build_object('ok', true, 'state', 'friends', 'message', 'Friend request accepted. You are now SPIKE friends.');
  end if;

  -- You already have a pending outgoing request
  if v_out.status = 'pending' then
    return jsonb_build_object('ok', true, 'state', 'pending_out', 'message', 'Friend request already sent. Waiting for them to accept.');
  end if;

  -- Clear any stale one-way row then insert pending request
  delete from public.follows
  where follower_id = v_me and following_id = p_target_user_id;

  insert into public.follows (follower_id, following_id, status)
  values (v_me, p_target_user_id, 'pending');

  return jsonb_build_object(
    'ok', true,
    'state', 'pending_out',
    'message', 'Friend request sent. They can accept it in Friends.'
  );
end;
$$;

revoke all on function public.spike_send_friend_request(uuid) from public;
grant execute on function public.spike_send_friend_request(uuid) to authenticated;

create or replace function public.spike_accept_friend_request(p_from_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_req public.follows%rowtype;
begin
  if v_me is null then raise exception 'Sign in to accept friend requests.'; end if;
  if p_from_user_id is null or p_from_user_id = v_me then raise exception 'Invalid request.'; end if;

  select * into v_req from public.follows
  where follower_id = p_from_user_id and following_id = v_me and status = 'pending';
  if not found then
    raise exception 'No pending friend request from this member.';
  end if;

  delete from public.follows
  where (follower_id = v_me and following_id = p_from_user_id)
     or (follower_id = p_from_user_id and following_id = v_me);

  insert into public.follows (follower_id, following_id, status) values
    (v_me, p_from_user_id, 'accepted'),
    (p_from_user_id, v_me, 'accepted');

  return jsonb_build_object('ok', true, 'state', 'friends', 'message', 'You are now SPIKE friends.');
end;
$$;

revoke all on function public.spike_accept_friend_request(uuid) from public;
grant execute on function public.spike_accept_friend_request(uuid) to authenticated;

create or replace function public.spike_decline_friend_request(p_from_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Sign in to manage requests.'; end if;
  if p_from_user_id is null then raise exception 'Invalid request.'; end if;

  delete from public.follows
  where follower_id = p_from_user_id and following_id = v_me and status = 'pending';

  return jsonb_build_object('ok', true, 'state', 'declined', 'message', 'Friend request declined.');
end;
$$;

revoke all on function public.spike_decline_friend_request(uuid) from public;
grant execute on function public.spike_decline_friend_request(uuid) to authenticated;

create or replace function public.spike_cancel_friend_request(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Sign in to manage requests.'; end if;
  delete from public.follows
  where follower_id = v_me and following_id = p_target_user_id and status = 'pending';
  return jsonb_build_object('ok', true, 'state', 'cancelled', 'message', 'Friend request cancelled.');
end;
$$;

revoke all on function public.spike_cancel_friend_request(uuid) from public;
grant execute on function public.spike_cancel_friend_request(uuid) to authenticated;

-- Incoming pending requests for me
create or replace function public.spike_list_incoming_friend_requests(p_limit int default 100)
returns table (user_id uuid, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select f.follower_id as user_id, f.created_at
  from public.follows f
  where f.following_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.spike_list_incoming_friend_requests(int) from public;
grant execute on function public.spike_list_incoming_friend_requests(int) to authenticated;

-- Outgoing pending requests I sent
create or replace function public.spike_list_outgoing_friend_requests(p_limit int default 100)
returns table (user_id uuid, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select f.following_id as user_id, f.created_at
  from public.follows f
  where f.follower_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.spike_list_outgoing_friend_requests(int) from public;
grant execute on function public.spike_list_outgoing_friend_requests(int) to authenticated;

-- Keep unfriend from previous migration (both accepted directions)
-- Keep list mutual friends from previous migration
