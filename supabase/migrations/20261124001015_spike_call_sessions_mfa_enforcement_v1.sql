-- Extend the existing opt-in MFA enforcement to call sessions created after
-- the original public-table sweep. This protects direct table access and
-- SECURITY DEFINER call RPC writes (the DML trigger still executes).
begin;

alter table public.spike_call_sessions enable row level security;

drop policy if exists mfa_opt_in_enforcement on public.spike_call_sessions;
create policy mfa_opt_in_enforcement
  on public.spike_call_sessions
  as restrictive
  for all
  to authenticated
  using ((select private.mfa_access_allowed()))
  with check ((select private.mfa_access_allowed()));

drop trigger if exists spike_mfa_opt_in_guard on public.spike_call_sessions;
create trigger spike_mfa_opt_in_guard
  before insert or update or delete
  on public.spike_call_sessions
  for each row
  execute function private.enforce_mfa_for_opted_in_user();

commit;
