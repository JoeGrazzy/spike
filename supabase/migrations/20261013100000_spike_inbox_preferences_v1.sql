-- SPIKE Smart Inbox preferences: per-user pin/archive state synced across devices.
-- Additive migration; it does not alter existing message or room data.
create table if not exists public.spike_inbox_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  other_user_id uuid not null references auth.users(id) on delete cascade,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  constraint spike_inbox_preferences_not_self check (user_id <> other_user_id)
);

create index if not exists spike_inbox_preferences_user_pinned_idx
  on public.spike_inbox_preferences (user_id, is_pinned) where is_pinned;
create index if not exists spike_inbox_preferences_user_archived_idx
  on public.spike_inbox_preferences (user_id, is_archived) where is_archived;

alter table public.spike_inbox_preferences enable row level security;

drop policy if exists spike_inbox_preferences_select_own on public.spike_inbox_preferences;
create policy spike_inbox_preferences_select_own
  on public.spike_inbox_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists spike_inbox_preferences_insert_own on public.spike_inbox_preferences;
create policy spike_inbox_preferences_insert_own
  on public.spike_inbox_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and user_id <> other_user_id);

drop policy if exists spike_inbox_preferences_update_own on public.spike_inbox_preferences;
create policy spike_inbox_preferences_update_own
  on public.spike_inbox_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and user_id <> other_user_id);

drop policy if exists spike_inbox_preferences_delete_own on public.spike_inbox_preferences;
create policy spike_inbox_preferences_delete_own
  on public.spike_inbox_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.spike_inbox_preferences to authenticated;
