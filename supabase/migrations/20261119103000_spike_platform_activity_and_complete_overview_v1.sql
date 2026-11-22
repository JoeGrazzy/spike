-- Authenticated activity heartbeat and owner-only overview completion.
-- Applied directly to the connected Supabase project on 2026-11-19.
begin;

create table if not exists private.spike_user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index if not exists spike_user_activity_last_seen_idx
  on private.spike_user_activity(last_seen_at desc);
revoke all on private.spike_user_activity from public, anon, authenticated;

create or replace function public.spike_touch_activity()
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $fn$
declare
  v_uid uuid := auth.uid();
  v_seen timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  insert into private.spike_user_activity(user_id,last_seen_at)
  values(v_uid,v_seen)
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at;
  return v_seen;
end
$fn$;
revoke all on function public.spike_touch_activity() from public, anon;
grant execute on function public.spike_touch_activity() to authenticated;

create or replace function public.spike_admin_get_platform_overview(
  p_today_start timestamptz,
  p_today_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can view platform statistics.' using errcode='42501';
  end if;
  if p_today_start is null or p_today_end is null or p_today_end <= p_today_start then
    raise exception 'A valid local-day range is required.' using errcode='22023';
  end if;
  return jsonb_build_object(
    'total_registered_users', (select count(*) from public.profiles where account_status <> 'deleted'),
    'active_users', (select count(*) from private.spike_user_activity a join public.profiles p on p.id=a.user_id where p.account_status='active' and a.last_seen_at >= now() - interval '30 days'),
    'online_users', (select count(*) from private.spike_user_activity a join public.profiles p on p.id=a.user_id where p.account_status='active' and a.last_seen_at >= now() - interval '90 seconds'),
    'new_registrations_today', (select count(*) from public.profiles where account_status <> 'deleted' and created_at >= p_today_start and created_at < p_today_end),
    'verified_users', (select count(*) from public.profiles where account_status <> 'deleted' and is_verified is true),
    'unverified_users', (select count(*) from public.profiles where account_status <> 'deleted' and is_verified is false),
    'suspended_accounts', (select count(*) from public.profiles where account_status = 'suspended'),
    'total_active_rooms', (select count(*) from public.rooms where status = 'live'),
    'total_gifts_sent', (select count(*) from private.spike_gift_events where status = 'settled'),
    'total_sp_coins_in_circulation', (select coalesce(sum(available_balance), 0) from public.wallet_accounts where currency = 'SPIKE_COIN'),
    'total_creator_earnings', (select coalesce(sum(e.creator_amount_ngn),0) from private.spike_creator_earnings e join private.spike_gift_events g on g.id=e.gift_event_id where e.status <> 'reversed' and g.status='settled'),
    'pending_withdrawals', (select count(*) from private.spike_withdrawal_requests where status='pending_review'),
    'pending_verification_requests', (select count(*) from private.spike_identity_verification_requests where status='pending_review'),
    'metric_availability', jsonb_build_object(
      'active_users', 'available',
      'online_users', 'available',
      'total_gifts_sent', 'available',
      'total_creator_earnings', 'available',
      'pending_withdrawals', 'available',
      'pending_verification_requests', 'available'
    )
  );
end;
$$;
revoke all on function public.spike_admin_get_platform_overview(timestamptz,timestamptz) from public, anon;
grant execute on function public.spike_admin_get_platform_overview(timestamptz,timestamptz) to authenticated;
commit;
