-- SPIKE performance hardening v18
create index if not exists gamification_settings_updated_by_idx on public.gamification_settings(updated_by);
create index if not exists user_achievements_achievement_id_idx on public.user_achievements(achievement_id);

-- Evaluate auth.uid() once per statement rather than once per row.
alter policy spike_task_completions_self_select on public.spike_task_completions
  using (user_id = (select auth.uid()));
