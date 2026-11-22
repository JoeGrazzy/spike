create index if not exists profiles_suspended_expiry_idx
  on public.profiles(suspension_expires_at)
  where account_status='suspended' and suspension_expires_at is not null;
create index if not exists spike_account_suspension_events_actor_idx
  on public.spike_account_suspension_events(actor_id)
  where actor_id is not null;
