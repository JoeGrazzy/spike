-- SPIKE onboarding progress persistence and engagement-event FK indexes.
-- Safe to apply repeatedly. User progress is private to the owning account.
create table if not exists public.spike_onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','skipped')),
  current_step integer not null default 0 check (current_step between 0 and 4),
  completed_at timestamptz,
  skipped_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.spike_onboarding_progress enable row level security;
revoke all on table public.spike_onboarding_progress from public, anon;
grant select, insert, update on table public.spike_onboarding_progress to authenticated;

drop policy if exists spike_onboarding_progress_select_own on public.spike_onboarding_progress;
create policy spike_onboarding_progress_select_own
  on public.spike_onboarding_progress for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists spike_onboarding_progress_insert_own on public.spike_onboarding_progress;
create policy spike_onboarding_progress_insert_own
  on public.spike_onboarding_progress for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists spike_onboarding_progress_update_own on public.spike_onboarding_progress;
create policy spike_onboarding_progress_update_own
  on public.spike_onboarding_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (auth.uid() = user_id);

create index if not exists post_engagement_events_actor_id_idx
  on public.post_engagement_events (actor_id);
create index if not exists post_engagement_events_owner_id_idx
  on public.post_engagement_events (owner_id);
