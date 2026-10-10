-- SPIKE public profile preview: expose only intentionally public profile fields.
-- Access is checked server-side so hiding a field in the UI is not the security boundary.
create or replace function public.get_spike_public_profile_preview(p_user_id uuid)
returns table(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  website text,
  verified boolean,
  mutual_friends integer
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (select auth.uid() as user_id),
  target as (
    select p.id, p.username, p.display_name, p.avatar_url, p.bio, p.website,
           coalesce(p.verified, false) as verified
    from public.profiles p
    cross join viewer v
    where v.user_id is not null
      and p.id = p_user_id
      and p.id <> v.user_id
      and p.activated is not false
      and public.can_discover_spike_profile(v.user_id, p.id)
      and not exists (
        select 1 from public.private_message_blocks b
        where (b.blocker_id = v.user_id and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = v.user_id)
      )
  )
  select t.id, t.username, t.display_name, t.avatar_url, t.bio, t.website, t.verified,
    coalesce((
      select count(distinct case when f1.user_id = auth.uid() then f1.friend_id else f1.user_id end)::integer
      from public.friendships f1
      where (f1.user_id = auth.uid() or f1.friend_id = auth.uid())
        and exists (
          select 1 from public.friendships f2
          where (f2.user_id = t.id and f2.friend_id = case when f1.user_id = auth.uid() then f1.friend_id else f1.user_id end)
             or (f2.friend_id = t.id and f2.user_id = case when f1.user_id = auth.uid() then f1.friend_id else f1.user_id end)
        )
    ), 0)::integer as mutual_friends
  from target t;
$$;

revoke all on function public.get_spike_public_profile_preview(uuid) from public, anon;
grant execute on function public.get_spike_public_profile_preview(uuid) to authenticated;

comment on function public.get_spike_public_profile_preview(uuid) is
'Returns a limited public profile preview only when the viewer is authenticated, the target is discoverable, and neither user has blocked the other.';
