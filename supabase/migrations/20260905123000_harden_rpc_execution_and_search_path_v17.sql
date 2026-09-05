-- SPIKE security hardening v17
-- Remove role-mutable search_path from the leveling RPC.
alter function public.get_spike_leveling_profile() set search_path = public;

-- Trigger-only function: it must not be callable through PostgREST.
revoke all on function public.sync_friend_request_notification() from public, anon, authenticated;

comment on function public.sync_friend_request_notification() is
  'Internal trigger only. Client EXECUTE revoked; emits friend-request notifications from the database trigger.';

comment on function public.get_spike_leveling_profile() is
  'Authenticated leveling profile RPC with an immutable function search_path.';
