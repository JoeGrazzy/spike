create or replace function public.get_spike_network_recommendations(p_limit integer default 12)
returns table(id uuid, username text, display_name text, avatar_url text, bio text, website text, sp_id text, verified boolean, level integer, rank text, mutual_friends integer, recent_interactions integer, network_score integer, reason_code text, reason_text text)
language sql stable security definer set search_path = public
as $$
with me as (select auth.uid() as user_id),
my_friends as (
 select distinct case when f.user_id = me.user_id then f.friend_id else f.user_id end friend_id
 from public.friendships f cross join me
 where me.user_id is not null and (f.user_id=me.user_id or f.friend_id=me.user_id)
),
candidates as (
 select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.verified,p.level,p.rank,
 coalesce((select count(distinct mf.friend_id)::int from my_friends mf where exists (select 1 from public.friendships cf where (cf.user_id=p.id and cf.friend_id=mf.friend_id) or (cf.friend_id=p.id and cf.user_id=mf.friend_id))),0) mutual_friends,
 coalesce((select count(*)::int from public.post_engagement_events e cross join me where me.user_id is not null and e.created_at>=now()-interval '30 days' and ((e.actor_id=me.user_id and e.owner_id=p.id) or (e.actor_id=p.id and e.owner_id=me.user_id)) and e.actor_id is distinct from e.owner_id),0) recent_interactions
 from public.profiles p cross join me
 where me.user_id is not null and p.id<>me.user_id and p.activated is not false and public.can_discover_spike_profile(me.user_id,p.id)
 and not exists (select 1 from public.private_message_blocks b where (b.blocker_id=me.user_id and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=me.user_id))
 and not exists (select 1 from public.friendships f where (f.user_id=me.user_id and f.friend_id=p.id) or (f.friend_id=me.user_id and f.user_id=p.id))
 and not exists (select 1 from public.friend_requests r where r.status='pending' and ((r.sender_id=me.user_id and r.recipient_id=p.id) or (r.sender_id=p.id and r.recipient_id=me.user_id)))
), ranked as (
 select c.*, (c.mutual_friends*10+c.recent_interactions*4+case when c.verified then 1 else 0 end+case when c.level>=10 then 1 else 0 end)::int network_score from candidates c
)
select r.id,r.username,r.display_name,r.avatar_url,r.bio,r.website,r.sp_id,r.verified,r.level,r.rank,r.mutual_friends,r.recent_interactions,r.network_score,
 case when r.mutual_friends>=3 then 'mutual_network' when r.mutual_friends>0 then 'mutual_friend' when r.recent_interactions>=2 then 'interaction' else 'network_discovery' end reason_code,
 case when r.mutual_friends>=3 then r.mutual_friends::text||' mutual friends' when r.mutual_friends=2 then '2 mutual friends' when r.mutual_friends=1 then '1 mutual friend' when r.recent_interactions>=2 then 'You have interacted recently' else 'A new person from your wider network' end reason_text
from ranked r order by r.network_score desc,r.mutual_friends desc,r.recent_interactions desc,r.verified desc,r.display_name nulls last limit least(greatest(coalesce(p_limit,12),1),50);
$$;
revoke execute on function public.get_spike_network_recommendations(integer) from public, anon;
grant execute on function public.get_spike_network_recommendations(integer) to authenticated;
