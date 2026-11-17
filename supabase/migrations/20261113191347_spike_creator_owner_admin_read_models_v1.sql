-- Owner-only read models for creator earnings balances and financial audit history.
-- Applied to the live SPIKE Supabase project as spike_creator_owner_admin_read_models_v1.

create or replace function public.admin_creator_list_balances(
  p_search text default null,
  p_limit integer default 200
)
returns table(
  user_id uuid,
  display_name text,
  username text,
  sp_id text,
  earned_balance bigint,
  reserved_balance bigint,
  available_balance bigint,
  lifetime_earned_units bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    w.user_id,
    coalesce(p.display_name, p.full_name, p.username, w.user_id::text),
    p.username,
    p.sp_id,
    w.earned_balance,
    w.reserved_balance,
    w.earned_balance - w.reserved_balance,
    coalesce((
      select sum(l.amount_units)
      from public.spike_creator_earnings_ledger l
      where l.user_id = w.user_id and l.amount_units > 0
    ), 0)::bigint,
    w.updated_at
  from public.spike_creator_wallets w
  left join public.profiles p on p.id = w.user_id
  where private.spike_is_owner()
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or coalesce(p.display_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(p.username, '') ilike '%' || ltrim(trim(p_search), '@') || '%'
      or coalesce(p.sp_id, '') ilike '%' || trim(p_search) || '%'
      or w.user_id::text ilike '%' || trim(p_search) || '%'
    )
  order by w.updated_at desc, w.user_id
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function public.admin_creator_list_financial_audit(
  p_limit integer default 200
)
returns table(
  id uuid,
  actor_id uuid,
  action text,
  target_user_id uuid,
  role text,
  details jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select a.id, a.actor_id, a.action, a.target_user_id, a.role, a.details, a.created_at
  from public.admin_audit a
  where private.spike_is_owner()
    and (
      a.action like 'coin_order_%'
      or a.action = 'coins_granted'
      or a.action like 'creator_%'
      or a.action like 'legacy_gems_payout_%'
    )
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.admin_creator_list_balances(text, integer) from public, anon;
grant execute on function public.admin_creator_list_balances(text, integer) to authenticated;
revoke all on function public.admin_creator_list_financial_audit(integer) from public, anon;
grant execute on function public.admin_creator_list_financial_audit(integer) to authenticated;
