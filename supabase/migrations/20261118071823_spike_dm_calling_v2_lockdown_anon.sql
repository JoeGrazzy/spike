-- Supabase project defaults may grant new public tables to anon; explicitly remove it.
revoke all on table public.spike_dm_calls_v2 from anon, public;
revoke all on table public.spike_dm_call_ice_v2 from anon, public;
grant select, insert, update on table public.spike_dm_calls_v2 to authenticated;
grant select, insert on table public.spike_dm_call_ice_v2 to authenticated;
