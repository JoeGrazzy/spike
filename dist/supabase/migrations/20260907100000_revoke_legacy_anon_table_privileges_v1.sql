-- Production hardening: remove legacy anon table privileges from
-- authenticated-only gamification/activity tables. RLS already denies anon
-- access; revoking the grants restores least privilege at the SQL privilege layer.
revoke all on table public.achievements from anon;
revoke all on table public.level_definitions from anon;
revoke all on table public.spike_task_completions from anon;
revoke all on table public.user_achievements from anon;
revoke all on table public.user_activity_events from anon;
revoke all on table public.xp_transactions from anon;
