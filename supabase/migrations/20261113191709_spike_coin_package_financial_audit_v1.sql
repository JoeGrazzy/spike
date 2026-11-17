-- Record Owner package creation and edits in the financial audit trail.
-- Applied to the live SPIKE Supabase project as spike_coin_package_financial_audit_v1.

create or replace function public.admin_create_coin_package(
  p_name text, p_coins bigint, p_bonus_coins bigint,
  p_price_minor bigint, p_currency text, p_display_order integer default 0
)
returns public.coin_packages
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare r public.coin_packages;
begin
  if not private.spike_is_owner() then
    raise exception 'Dedicated Owner access required' using errcode='42501';
  end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name)) > 100 then
    raise exception 'Package name is required (maximum 100 characters)';
  end if;
  if p_coins is null or p_coins < 1 or p_coins > 1000000000 then
    raise exception 'Invalid coin amount';
  end if;
  if p_bonus_coins is null or p_bonus_coins < 0 or p_bonus_coins > 1000000000 then
    raise exception 'Invalid bonus coin amount';
  end if;
  if p_price_minor is null or p_price_minor < 1 then
    raise exception 'Package price must be positive';
  end if;
  if upper(coalesce(p_currency,'')) <> 'NGN' then
    raise exception 'Only NGN packages are currently supported';
  end if;
  insert into public.coin_packages(name,coins,bonus_coins,amount_minor,currency,display_order)
  values(trim(p_name),p_coins,p_bonus_coins,p_price_minor,'NGN',coalesce(p_display_order,0))
  returning * into r;
  insert into public.admin_audit(actor_id,action,role,details)
  values(auth.uid(),'coin_package_created','owner',jsonb_build_object(
    'package_id',r.id,'name',r.name,'coins',r.coins,'bonus_coins',r.bonus_coins,
    'amount_minor',r.amount_minor,'currency',r.currency,'display_order',r.display_order));
  return r;
end;
$$;

create or replace function public.admin_update_coin_package(
  p_id uuid, p_name text, p_coins bigint, p_bonus_coins bigint,
  p_price_minor bigint, p_currency text, p_display_order integer default 0,
  p_active boolean default true
)
returns public.coin_packages
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare r public.coin_packages; v_before public.coin_packages;
begin
  if not private.spike_is_owner() then
    raise exception 'Dedicated Owner access required' using errcode='42501';
  end if;
  if p_id is null then raise exception 'Package is required'; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name)) > 100 then
    raise exception 'Package name is required (maximum 100 characters)';
  end if;
  if p_coins is null or p_coins < 1 or p_coins > 1000000000
     or p_bonus_coins is null or p_bonus_coins < 0 or p_bonus_coins > 1000000000
     or p_price_minor is null or p_price_minor < 1 then
    raise exception 'Invalid package amounts';
  end if;
  if upper(coalesce(p_currency,'')) <> 'NGN' then
    raise exception 'Only NGN packages are currently supported';
  end if;
  select * into v_before from public.coin_packages where id=p_id for update;
  if not found then raise exception 'Package not found'; end if;
  update public.coin_packages
  set name=trim(p_name),coins=p_coins,bonus_coins=p_bonus_coins,
      amount_minor=p_price_minor,currency='NGN',display_order=coalesce(p_display_order,0),
      active=coalesce(p_active,true),updated_at=now()
  where id=p_id returning * into r;
  insert into public.admin_audit(actor_id,action,role,details)
  values(auth.uid(),'coin_package_updated','owner',jsonb_build_object(
    'package_id',r.id,
    'before',jsonb_build_object('name',v_before.name,'coins',v_before.coins,
      'bonus_coins',v_before.bonus_coins,'amount_minor',v_before.amount_minor,
      'currency',v_before.currency,'display_order',v_before.display_order,'active',v_before.active),
    'after',jsonb_build_object('name',r.name,'coins',r.coins,
      'bonus_coins',r.bonus_coins,'amount_minor',r.amount_minor,
      'currency',r.currency,'display_order',r.display_order,'active',r.active)));
  return r;
end;
$$;

create or replace function public.admin_creator_list_financial_audit(p_limit integer default 200)
returns table(id uuid,actor_id uuid,action text,target_user_id uuid,role text,details jsonb,created_at timestamptz)
language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  select a.id,a.actor_id,a.action,a.target_user_id,a.role,a.details,a.created_at
  from public.admin_audit a
  where private.spike_is_owner()
    and (a.action like 'coin_order_%' or a.action like 'coin_package_%'
      or a.action='coins_granted' or a.action like 'creator_%'
      or a.action like 'legacy_gems_payout_%')
  order by a.created_at desc,a.id desc
  limit greatest(1,least(coalesce(p_limit,200),500));
$$;

revoke all on function public.admin_create_coin_package(text,bigint,bigint,bigint,text,integer) from public,anon;
grant execute on function public.admin_create_coin_package(text,bigint,bigint,bigint,text,integer) to authenticated;
revoke all on function public.admin_update_coin_package(uuid,text,bigint,bigint,bigint,text,integer,boolean) from public,anon;
grant execute on function public.admin_update_coin_package(uuid,text,bigint,bigint,bigint,text,integer,boolean) to authenticated;
revoke all on function public.admin_creator_list_financial_audit(integer) from public,anon;
grant execute on function public.admin_creator_list_financial_audit(integer) to authenticated;
