-- Optimize per-row auth identity checks in onboarding RLS policies.
drop policy if exists spike_onboarding_progress_select_own on public.spike_onboarding_progress;
create policy spike_onboarding_progress_select_own on public.spike_onboarding_progress
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists spike_onboarding_progress_insert_own on public.spike_onboarding_progress;
create policy spike_onboarding_progress_insert_own on public.spike_onboarding_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists spike_onboarding_progress_update_own on public.spike_onboarding_progress;
create policy spike_onboarding_progress_update_own on public.spike_onboarding_progress
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
