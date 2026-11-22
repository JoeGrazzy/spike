-- Owner-only, authoritative platform overview metrics. Unsupported metrics remain unavailable in the UI.
create or replace function public.spike_admin_get_platform_overview(p_today_start timestamptz, p_today_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can view platform statistics.';
  end if;
  if p_today_start is null or p_today_end is null or p_today_end <= p_today_start then
    raise exception 'A valid local-day range is required.';
  end if;
  return jsonb_build_object(
    'total_registered_users', (select count(*) from public.profiles),
    'new_registrations_today', (select count(*) from public.profiles where created_at >= p_today_start and created_at < p_today_end),
    'verified_users', (select count(*) from public.profiles where is_verified is true),
    'unverified_users', (select count(*) from public.profiles where is_verified is false),
    'suspended_accounts', (select count(*) from public.profiles where account_status = 'suspended'),
    'total_active_rooms', (select count(*) from public.rooms where status = 'live'),
    'total_sp_coins_in_circulation', (select coalesce(sum(available_balance), 0) from public.wallet_accounts where currency = 'SPIKE_COIN')
  );
end;
$$;
revoke all on function public.spike_admin_get_platform_overview(timestamptz,timestamptz) from public, anon;
grant execute on function public.spike_admin_get_platform_overview(timestamptz,timestamptz) to authenticated;
