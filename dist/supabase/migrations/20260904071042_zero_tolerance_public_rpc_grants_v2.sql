-- Least-privilege RPC and table exposure hardening.
revoke all on function public.admin_list_user_verification(uuid[]) from public;
revoke all on function public.admin_list_user_verification(uuid[]) from anon;
grant execute on function public.admin_list_user_verification(uuid[]) to authenticated;
revoke all on function public.admin_set_user_verified(uuid, boolean) from public;
revoke all on function public.admin_set_user_verified(uuid, boolean) from anon;
grant execute on function public.admin_set_user_verified(uuid, boolean) to authenticated;
revoke all on function public.get_public_profiles(uuid[]) from public;
revoke all on function public.get_public_profiles(uuid[]) from anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;
revoke all on function private.admin_list_user_verification(uuid[]) from public;
revoke all on function private.admin_list_user_verification(uuid[]) from anon;
revoke all on function private.admin_set_user_verified(uuid, boolean) from public;
revoke all on function private.admin_set_user_verified(uuid, boolean) from anon;

do $do$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' and (tablename like 'admin_%' or tablename like 'private_%' or tablename like 'spike_%' or tablename in ('profiles','profile_privacy','user_app_settings','user_presence','user_streaks','wallets','coin_orders','coin_transactions','gem_transactions','gift_history','monthly_payouts','room_bans','room_entitlements','room_event_tickets','room_moderation_actions','room_purchase_requests')) loop
    execute format('revoke all on table public.%I from public', r.tablename);
    execute format('revoke all on table public.%I from anon', r.tablename);
  end loop;
end
$do$;
