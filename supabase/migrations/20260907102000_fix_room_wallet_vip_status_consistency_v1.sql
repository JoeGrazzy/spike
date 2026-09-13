-- Keep wallet ranking VIP detection consistent with the authoritative Room VIP
-- entitlement used by the public VIP status RPC.
create or replace function public.spike_top_wallet_rankings(p_room_id uuid, p_limit integer default 10)
returns table(rank_no integer, user_id uuid, display_name text, username text, avatar_url text, category text, score numeric, gems_received numeric, coins_sent bigint, streak_days integer, vip boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.room_members rm where rm.room_id=p_room_id and rm.user_id=v_uid and coalesce(rm.active,true)) then raise exception 'Room membership required'; end if;
 return query
 with members as (
   select rm.user_id from public.room_members rm where rm.room_id=p_room_id and coalesce(rm.active,true)
 ), stats as (
   select m.user_id,
          coalesce(sum(case when gh.receiver_id=m.user_id then gh.gems_earned else 0 end),0)::numeric/1000000 as gems_received,
          coalesce(sum(case when gh.sender_id=m.user_id then gh.coin_cost else 0 end),0)::bigint as coins_sent,
          coalesce(us.current_streak,0) as streak_days
   from members m left join public.gift_history gh on gh.room_id=p_room_id and (gh.receiver_id=m.user_id or gh.sender_id=m.user_id)
   left join public.user_streaks us on us.user_id=m.user_id
   group by m.user_id,us.current_streak
 ), scored as (
   select s.*, (s.gems_received*100 + s.coins_sent*0.10 + s.streak_days*25)::numeric score,
          case when s.gems_received>0 and s.coins_sent>0 then 'Top Creator'
               when s.gems_received>0 then 'Top Receiver'
               when s.coins_sent>0 then 'Top Gifter'
               when s.streak_days>0 then 'Top Streak'
               else 'Rising' end category
   from stats s where s.user_id<>v_uid
 ), ranked as (
   select row_number() over(order by score desc, gems_received desc, coins_sent desc, streak_days desc, user_id)::integer rank_no,* from scored
 )
 select r.rank_no,r.user_id,p.display_name,p.username,p.avatar_url,r.category,r.score,r.gems_received,r.coins_sent,r.streak_days,
        exists(select 1 from public.room_entitlements e where e.user_id=r.user_id and e.room_id=p_room_id and lower(coalesce(e.item_type,''))='premium_room' and lower(coalesce(e.item_name,'')) like '%vip%' and (e.expires_at is null or e.expires_at>now())) as vip
 from ranked r join public.profiles p on p.id=r.user_id
 where r.rank_no<=greatest(1,least(coalesce(p_limit,10),50))
 order by r.rank_no;
end $$;
