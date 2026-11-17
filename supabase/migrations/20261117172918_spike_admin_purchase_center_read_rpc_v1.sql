-- SPIKE admin Purchase & Payment Centre read model.
-- Reuses coin_orders and spike_verified_subscriptions; no duplicate request tables.
create or replace function public.admin_purchase_center_coin_orders(
  p_status text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  user_id uuid,
  package_id uuid,
  reference text,
  coins bigint,
  bonus_coins bigint,
  amount_minor bigint,
  currency text,
  status text,
  payment_reference text,
  rejection_reason text,
  cancellation_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  username text,
  sp_id text,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.spike_is_owner() then
    raise exception 'Dedicated Owner access required' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('pending','payment_reported','approved','rejected','cancelled') then
    raise exception 'Invalid SP Coin purchase status';
  end if;

  return query
    select o.id, o.user_id, o.package_id, o.reference, o.coins, o.bonus_coins,
      o.amount_minor, o.currency, o.status, o.payment_reference, o.rejection_reason,
      o.cancellation_reason, o.created_at, o.updated_at,
      p.display_name, p.username, p.sp_id, u.email::text
    from public.coin_orders o
    left join public.profiles p on p.id = o.user_id
    left join auth.users u on u.id = o.user_id
    where p_status is null or o.status = p_status
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$function$;

revoke all on function public.admin_purchase_center_coin_orders(text, integer) from public, anon;
grant execute on function public.admin_purchase_center_coin_orders(text, integer) to authenticated;
