-- Permanently remove the legacy XP/level/streak/check-in/community-mission subsystem.
-- Preserve unrelated wallet/coin transactions, room features, and historical migration files.
-- This intentionally deletes only data owned by the retired progression feature.

-- Remove callable routines first so no client can continue using progression endpoints.
DROP FUNCTION IF EXISTS public.spike_daily_check_in(text);
DROP FUNCTION IF EXISTS public.spike_distribute_streak_pool(date);
DROP FUNCTION IF EXISTS public.spike_mission_create(text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.spike_mission_join(uuid);
DROP FUNCTION IF EXISTS public.spike_mission_progress(uuid, integer);
DROP FUNCTION IF EXISTS public.spike_missions_list();
DROP FUNCTION IF EXISTS public.spike_revive_streak(text);
DROP FUNCTION IF EXISTS public.spike_streak_multiplier(integer);
DROP FUNCTION IF EXISTS public.spike_gamification_award(uuid, integer, text, text, jsonb);
DROP FUNCTION IF EXISTS public.trg_spike_gamification_user();

-- These tables exist solely for the retired progression subsystem. CASCADE is limited
-- to dependencies of these named tables (e.g. their policies/indexes/FKs).
DROP TABLE IF EXISTS public.spike_community_mission_members CASCADE;
DROP TABLE IF EXISTS public.spike_community_mission_progress_events CASCADE;
DROP TABLE IF EXISTS public.spike_community_missions CASCADE;
DROP TABLE IF EXISTS public.spike_world_reward_events CASCADE;
DROP TABLE IF EXISTS public.streak_pool_distribution CASCADE;
DROP TABLE IF EXISTS public.streak_pool CASCADE;
DROP TABLE IF EXISTS public.user_streaks CASCADE;
