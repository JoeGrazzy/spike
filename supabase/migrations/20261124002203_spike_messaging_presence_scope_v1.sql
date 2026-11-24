-- Include eligible direct-conversation partners in inbox presence without
-- weakening profile visibility, account-state, or block protections.
create or replace function public.spike_get_messaging_presence()
returns table(user_id uuid, last_seen_at timestamptz, is_online boolean)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  with caller as (
    select auth.uid() as user_id
  ), candidates as (
    -- Preserve the existing mutual-follow presence experience.
    select friend.id as user_id
    from caller c
    join public.follows mine
      on mine.follower_id = c.user_id and mine.status = 'accepted'
    join public.follows reciprocal
      on reciprocal.follower_id = mine.following_id
     and reciprocal.following_id = mine.follower_id
     and reciprocal.status = 'accepted'
    join public.profiles friend on friend.id = mine.following_id

    union

    -- A direct-message participant can see the other participant's
    -- presence even when they are not mutual followers.
    select peer.user_id
    from caller c
    join public.conversation_members mine
      on mine.user_id = c.user_id
    join public.conversations conv
      on conv.id = mine.conversation_id and conv.kind = 'direct'
    join public.conversation_members peer
      on peer.conversation_id = mine.conversation_id
     and peer.user_id <> c.user_id
  )
  select distinct p.id, presence.last_seen_at,
         presence.last_seen_at >= now() - interval '150 seconds'
  from candidates candidate
  join public.profiles p on p.id = candidate.user_id
  join private.spike_user_presence presence on presence.user_id = p.id
  where auth.uid() is not null
    and p.account_status = 'active'
    and p.presence_visible is true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    );
$function$;

revoke all on function public.spike_get_messaging_presence() from public, anon;
grant execute on function public.spike_get_messaging_presence() to authenticated;
