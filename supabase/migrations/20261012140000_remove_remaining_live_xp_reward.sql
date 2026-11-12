-- Remove XP rewards from the retained legacy Live-missions schema; preserve its other fields.
ALTER TABLE public.spike_live_missions DROP COLUMN IF EXISTS reward_xp;
