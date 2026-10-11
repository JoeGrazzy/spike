-- Permanently disable the SPIKE XP/level/achievement/missions gamification feature.
-- Historical tables and profile columns are intentionally retained for data
-- preservation; all automatic event hooks and client RPC access are disabled.
DROP TRIGGER IF EXISTS trg_spike_gamif_private_messages ON public.private_messages;
DROP TRIGGER IF EXISTS trg_spike_gamif_room_messages ON public.room_messages;
DROP TRIGGER IF EXISTS trg_spike_gamif_comments ON public.comments;
DROP TRIGGER IF EXISTS trg_spike_gamif_posts ON public.app_documents;
DROP TRIGGER IF EXISTS trg_spike_gamif_room_members ON public.room_members;

DO $disable_gamification$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'admin_gamification_%'
        OR p.proname LIKE 'spike_gamification_%'
        OR p.proname IN (
          'spike_refresh_gamification',
          'get_spike_leveling_profile',
          'gamification_admin_guard',
          'spike_revive_streak',
          'spike_streak_multiplier'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END;
$disable_gamification$;

DO $deactivate_gamification$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'active'
      AND table_name IN (
        'gamification_tasks',
        'gamification_weekly_challenges',
        'gamification_achievements',
        'spike_gamification_tasks',
        'spike_gamification_weekly_challenges',
        'spike_gamification_achievements'
      )
  LOOP
    EXECUTE format('UPDATE %I.%I SET active = false WHERE active IS DISTINCT FROM false',
                   r.table_schema, r.table_name);
  END LOOP;
END;
$deactivate_gamification$;
