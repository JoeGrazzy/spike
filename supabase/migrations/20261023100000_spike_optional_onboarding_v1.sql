-- SPIKE optional onboarding progress v1.
-- Package this migration with the app; do not apply to production without approval.
create table if not exists public.spike_onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'skipped')),
  current_step integer not null default 0 check (current_step between 0 and 5),
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spike_onboarding_progress enable row level security;

revoke all on table public.spike_onboarding_progress from anon, public;
grant select, insert, update on table public.spike_onboarding_progress to authenticated;

drop policy if exists "onboarding progress read own" on public.spike_onboarding_progress;
create policy "onboarding progress read own"
  on public.spike_onboarding_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "onboarding progress insert own" on public.spike_onboarding_progress;
create policy "onboarding progress insert own"
  on public.spike_onboarding_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "onboarding progress update own" on public.spike_onboarding_progress;
create policy "onboarding progress update own"
  on public.spike_onboarding_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.spike_onboarding_progress is
  'Optional SPIKE onboarding status and lesson position, scoped to the authenticated user.';
