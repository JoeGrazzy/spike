-- Phase 4: add the ten foreign-key indexes reported by Supabase's
-- unindexed_foreign_keys performance advisor. No policies or data are changed.
create index if not exists spike_financial_request_events_actor_id_idx
  on private.spike_financial_request_events (actor_id);

create index if not exists spike_identity_verification_requests_reviewed_by_idx
  on private.spike_identity_verification_requests (reviewed_by);

create index if not exists spike_withdrawal_requests_reviewed_by_idx
  on private.spike_withdrawal_requests (reviewed_by);

create index if not exists profiles_suspension_issued_by_idx
  on public.profiles (suspension_issued_by);

create index if not exists spike_account_deletion_requests_actor_id_idx
  on public.spike_account_deletion_requests (actor_id);

create index if not exists spike_account_deletion_requests_reviewed_by_idx
  on public.spike_account_deletion_requests (reviewed_by);

create index if not exists spike_admin_verification_events_actor_id_idx
  on public.spike_admin_verification_events (actor_id);

create index if not exists spike_admin_verification_events_target_user_id_idx
  on public.spike_admin_verification_events (target_user_id);

create index if not exists spike_user_moderation_controls_updated_by_idx
  on public.spike_user_moderation_controls (updated_by);

create index if not exists spike_user_moderation_events_actor_id_idx
  on public.spike_user_moderation_events (actor_id);
