-- SPIKE QR-first friendship system
-- Mutual accepted follows are the source of friends.
-- QR connect creates both directions in one secured RPC.

create or replace function public.spike_connect_via_qr(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_blocked boolean := false;
  v_already_mutual boolean := false;
begin
  if v_me is null then
    raise exception 'Sign in to connect with someone on SPIKE.';
  end if;

  if p_target_user_id is null then
    raise exception 'Invalid SPIKE member.';
  end if;

  if p_target_user_id = v_me then
    raise exception 'You cannot connect with yourself.';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_user_id;

  if not found then
    raise exception 'This SPIKE member was not found.';
  end if;

  if coalesce(v_target.account_status, 'active') <> 'active' then
    raise exception 'This account is unavailable.';
  end if;

  -- Block checks (either direction)
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_target_user_id)
       or (b.blocker_id = p_target_user_id and b.blocked_id = v_me)
  ) into v_blocked;

  if v_blocked then
    raise exception 'You cannot connect with this member.';
  end if;

  -- Already mutual?
  select exists (
    select 1
    from public.follows a
    join public.follows b
      on b.follower_id = a.following_id
     and b.following_id = a.follower_id
     and b.status = 'accepted'
    where a.follower_id = v_me
      and a.following_id = p_target_user_id
      and a.status = 'accepted'
  ) into v_already_mutual;

  if v_already_mutual then
    return jsonb_build_object(
      'ok', true,
      'already_friends', true,
      'friend_id', p_target_user_id,
      'message', 'You are already SPIKE friends.'
    );
  end if;

  -- Ensure both directions exist as accepted (mutual friendship)
  delete from public.follows
  where (follower_id = v_me and following_id = p_target_user_id)
     or (follower_id = p_target_user_id and following_id = v_me);

  insert into public.follows (follower_id, following_id, status)
  values
    (v_me, p_target_user_id, 'accepted'),
    (p_target_user_id, v_me, 'accepted');

  return jsonb_build_object(
    'ok', true,
    'already_friends', false,
    'friend_id', p_target_user_id,
    'message', 'You are now SPIKE friends.'
  );
end;
$$;

revoke all on function public.spike_connect_via_qr(uuid) from public;
grant execute on function public.spike_connect_via_qr(uuid) to authenticated;

create or replace function public.spike_unfriend(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Sign in to manage friends.';
  end if;

  if p_target_user_id is null or p_target_user_id = v_me then
    raise exception 'Invalid member.';
  end if;

  delete from public.follows
  where (follower_id = v_me and following_id = p_target_user_id)
     or (follower_id = p_target_user_id and following_id = v_me);

  return jsonb_build_object('ok', true, 'friend_id', p_target_user_id);
end;
$$;

revoke all on function public.spike_unfriend(uuid) from public;
grant execute on function public.spike_unfriend(uuid) to authenticated;

-- Optional helper: mutual friends list for the authenticated user
create or replace function public.spike_list_mutual_friends(p_limit int default 200, p_offset int default 0)
returns table (
  user_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    mine.following_id as user_id,
    greatest(mine.created_at, reciprocal.created_at) as created_at
  from public.follows mine
  join public.follows reciprocal
    on reciprocal.follower_id = mine.following_id
   and reciprocal.following_id = mine.follower_id
   and reciprocal.status = 'accepted'
  where mine.follower_id = auth.uid()
    and mine.status = 'accepted'
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.spike_list_mutual_friends(int, int) from public;
grant execute on function public.spike_list_mutual_friends(int, int) to authenticated;
