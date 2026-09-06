-- SPIKE production hardening: close authorization gaps in SECURITY DEFINER RPCs.

create or replace function public.spike_record_activity_for_user(p_user_id uuid)
returns public.user_streaks
language plpgsql
security definer
set search_path = 'public'
as $$
declare v_s public.user_streaks; v_today date:=current_date; v_last date;
begin
  if auth.uid() is null or p_user_id is null or p_user_id <> auth.uid() then raise exception 'Not authorized'; end if;
  insert into public.user_streaks(user_id) values(p_user_id) on conflict do nothing;
  select * into v_s from public.user_streaks where user_id=p_user_id for update;
  if not public.spike_revenue_today() then return v_s; end if;
  v_last:=v_s.last_activity::date;
  if v_last is null then v_s.current_streak:=1; v_s.longest_streak:=greatest(v_s.longest_streak,1); v_s.revenue_days:=1;
  elsif v_last=v_today then return v_s;
  elsif v_last=v_today-1 then v_s.current_streak:=v_s.current_streak+1; v_s.longest_streak:=greatest(v_s.longest_streak,v_s.current_streak); v_s.revenue_days:=v_s.revenue_days+1;
  else return v_s; end if;
  v_s.last_activity:=now();
  update public.user_streaks set current_streak=v_s.current_streak,longest_streak=v_s.longest_streak,last_activity=v_s.last_activity,revenue_days=v_s.revenue_days where user_id=p_user_id;
  return v_s;
end;
$$;

create or replace function public.room_reward_leaderboard(p_room_id uuid)
returns table(user_id uuid, score bigint)
language sql stable security definer set search_path='public'
as $$
  select e.user_id,count(*)::bigint as score from public.room_entitlements e
  join public.room_store_items i on i.id=e.item_id
  where e.room_id=p_room_id and e.item_type='reward' and i.name not ilike '%Profile Boost%'
    and public.is_room_member(p_room_id)
  group by e.user_id order by score desc limit 20;
$$;

create or replace function public.room_public_vip_status(p_room_id uuid, p_user_ids uuid[])
returns table(user_id uuid, is_vip boolean)
language sql security definer set search_path='public'
as $$
  select u.id, exists(select 1 from public.room_entitlements e where e.room_id=p_room_id and e.user_id=u.id and lower(coalesce(e.item_type,''))='premium_room' and lower(coalesce(e.item_name,'')) like '%vip%' and (e.expires_at is null or e.expires_at>now()))
  from unnest(coalesce(p_user_ids,array[]::uuid[])) as u(id)
  where public.is_room_member(p_room_id)
    and exists(select 1 from public.room_members rm where rm.room_id=p_room_id and rm.user_id=u.id);
$$;

create or replace function public.spike_room_gift_recipients(p_room_id uuid)
returns table(user_id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path='public'
as $$
  select p.id,p.display_name,p.username,p.avatar_url from public.room_members rm join public.profiles p on p.id=rm.user_id
  where rm.room_id=p_room_id and rm.active=true and p.id<>auth.uid() and public.is_room_member(p_room_id)
  order by coalesce(nullif(p.display_name,''),p.username,p.sp_id,p.id::text);
$$;

create or replace function public.room_buy_with_coins(p_room_id uuid, p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='public'
as $$
declare v_user uuid:=auth.uid(); v_item public.room_store_items; v_wallet public.wallets; v_after bigint; v_exp timestamptz;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if not public.is_room_member(p_room_id) then raise exception 'Room membership required'; end if;
 select * into v_item from public.room_store_items where id=p_item_id and active=true and coin_price>0;
 if not found then raise exception 'Coin purchase item unavailable'; end if;
 select * into v_wallet from public.wallets where user_id=v_user for update;
 if not found then insert into public.wallets(user_id,balance) values(v_user,0) returning * into v_wallet; end if;
 if v_wallet.balance<v_item.coin_price then raise exception 'Insufficient coins'; end if;
 v_after:=v_wallet.balance-v_item.coin_price; update public.wallets set balance=v_after,updated_at=now() where user_id=v_user;
 insert into public.coin_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason) values(v_user,-v_item.coin_price,v_wallet.balance,v_after,'room_purchase',v_item.id::text,'Purchased '||v_item.name);
 if v_item.item_type='gift' then insert into public.room_gift_history(room_id,sender_id,item_id,item_name,coin_amount) values(p_room_id,v_user,v_item.id,v_item.name,v_item.coin_price); end if;
 v_exp:=case when coalesce(v_item.metadata->>'feature','')='profile_boost' then now()+interval '24 hours' else null end;
 insert into public.room_entitlements(user_id,room_id,item_type,item_id,item_name,expires_at) values(v_user,p_room_id,v_item.item_type,v_item.id,v_item.name,v_exp) on conflict(user_id,room_id,item_type,item_id) do update set created_at=now(),expires_at=excluded.expires_at;
 return jsonb_build_object('ok',true,'item',v_item.name,'balance',v_after,'expires_at',v_exp);
end;
$$;

create or replace function public.room_buy_style_with_coins(p_room_id uuid,p_item_id uuid,p_duration text default 'monthly')
returns jsonb language plpgsql security definer set search_path='public'
as $$
declare v_user uuid:=auth.uid(); v_item public.room_store_items; v_wallet public.wallets; v_cost bigint; v_after bigint; v_exp timestamptz;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if not public.is_room_member(p_room_id) then raise exception 'Room membership required'; end if;
 if p_duration not in ('monthly','lifetime') then raise exception 'Invalid style duration'; end if;
 select * into v_item from public.room_store_items where id=p_item_id and active=true and item_type='premium_style';
 if not found then raise exception 'Premium style unavailable'; end if;
 v_cost:=case when p_duration='lifetime' then 2000 else 500 end;
 select * into v_wallet from public.wallets where user_id=v_user for update;
 if not found then insert into public.wallets(user_id,balance) values(v_user,0) returning * into v_wallet; end if;
 if v_wallet.balance<v_cost then raise exception 'Insufficient coins'; end if;
 v_after:=v_wallet.balance-v_cost; update public.wallets set balance=v_after,updated_at=now() where user_id=v_user;
 insert into public.coin_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason) values(v_user,-v_cost,v_wallet.balance,v_after,'room_purchase',v_item.id::text,'Purchased '||v_item.name||' ('||p_duration||')');
 v_exp:=case when p_duration='monthly' then now()+interval '30 days' else null end;
 insert into public.room_entitlements(user_id,room_id,item_type,item_id,item_name,expires_at) values(v_user,p_room_id,'premium_style',v_item.id,v_item.name,v_exp) on conflict(user_id,room_id,item_type,item_id) do update set created_at=now(),expires_at=excluded.expires_at;
 return jsonb_build_object('ok',true,'item',v_item.name,'duration',p_duration,'balance',v_after,'expires_at',v_exp);
end;
$$;

alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
