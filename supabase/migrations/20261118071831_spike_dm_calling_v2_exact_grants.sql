-- Remove inherited/default grants, then allow only the required authenticated operations.
revoke all on table public.spike_dm_calls_v2 from anon, public, authenticated;
revoke all on table public.spike_dm_call_ice_v2 from anon, public, authenticated;
grant select, insert, update on table public.spike_dm_calls_v2 to authenticated;
grant select, insert on table public.spike_dm_call_ice_v2 to authenticated;
