-- Permanently retire the SPIKE Tools Feature Center previously exposed in the Feed menu.
-- Scope: Signal Series, Signal Collaboration, Feature Center Search launcher, and Resume Center.
-- Separate intelligence-suite collaboration tables and all core SPIKE systems remain.
begin;
drop function if exists public.spike_create_signal_series(text, text, text[]);
drop function if exists public.spike_signal_collaboration_respond(text, uuid, boolean);
drop function if exists public.spike_respond_signal_collaboration(text, uuid, boolean);
drop table if exists public.spike_series_items;
drop table if exists public.spike_signal_collaborators;
drop table if exists public.spike_resume_states;
drop table if exists public.spike_signal_series;
drop function if exists public.spike_feature_touch_updated_at();
commit;
