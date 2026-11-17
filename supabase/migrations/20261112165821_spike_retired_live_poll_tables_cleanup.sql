-- Complete the Polls data teardown by removing the orphaned live-stream poll tables.
-- The live-stream feature is already retired; no deployed RPC or active client code references these tables.
begin;
drop table if exists public.spike_live_poll_votes;
drop table if exists public.spike_live_poll_options;
drop table if exists public.spike_live_polls;
commit;
