-- Remove the obsolete client-claim RPC. V2 evaluates activity automatically.
drop function if exists public.spike_complete_daily_task(text);
