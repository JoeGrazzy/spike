-- SPIKE protected-core integrity layer.
-- Existing migrations are immutable; future schema changes must be additive migrations.
-- This migration prevents browser clients from directly mutating server-owned
-- gamification/streak state while preserving the profile fields the UI edits.

-- Server-owned streak state: read-only to authenticated clients.
revoke all on table public.user_streaks from anon, authenticated;
grant select on table public.user_streaks to authenticated;

-- Server-owned XP ledger: read-only to authenticated clients.
revoke all on table public.xp_transactions from anon, authenticated;
grant select on table public.xp_transactions to authenticated;

-- Profiles: users may edit identity/profile presentation fields only.
-- Server-owned fields (coins, XP, level/rank, streaks, verification,
-- activation, role, SP ID, restrictions, timestamps, etc.) remain RPC/admin-owned.
revoke insert, update on table public.profiles from anon, authenticated;

grant insert (
  id,
  full_name,
  display_name,
  username,
  avatar_url,
  bio,
  website,
  updated_at
) on table public.profiles to authenticated;

grant update (
  full_name,
  display_name,
  username,
  avatar_url,
  bio,
  website,
  updated_at
) on table public.profiles to authenticated;

-- Defense-in-depth invariants for streak state.
alter table public.user_streaks
  drop constraint if exists user_streaks_nonnegative_streaks;
alter table public.user_streaks
  add constraint user_streaks_nonnegative_streaks
  check (current_streak >= 0 and longest_streak >= current_streak);

alter table public.profiles
  drop constraint if exists profiles_nonnegative_streaks;
alter table public.profiles
  add constraint profiles_nonnegative_streaks
  check (current_streak >= 0 and longest_streak >= current_streak);

alter table public.profiles
  drop constraint if exists profiles_nonnegative_xp_level;
alter table public.profiles
  add constraint profiles_nonnegative_xp_level
  check (xp >= 0 and level >= 1);
