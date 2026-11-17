-- SPIKE performance: cover remaining foreign-key columns identified by Supabase advisor.
-- Additive only; no existing indexes, policies, data, or business logic are changed.
create index if not exists spike_room_members_invited_by_fk_idx on public.spike_room_members (invited_by) where invited_by is not null;
create index if not exists spike_room_live_audio_requests_decided_by_fk_idx on private.spike_room_live_audio_requests (decided_by) where decided_by is not null;
create index if not exists spike_gift_pool_ledger_room_id_fk_idx on public.spike_gift_pool_ledger (room_id);
create index if not exists spike_live_audio_gift_transactions_gift_id_fk_idx on public.spike_live_audio_gift_transactions (gift_id);
create index if not exists spike_room_invites_inviter_id_fk_idx on public.spike_room_invites (inviter_id);
create index if not exists spike_room_messages_reply_to_message_id_fk_idx on public.spike_room_messages (reply_to_message_id) where reply_to_message_id is not null;
create index if not exists spike_room_messages_pinned_by_fk_idx on public.spike_room_messages (pinned_by) where pinned_by is not null;
create index if not exists spike_room_messages_sender_id_fk_idx on public.spike_room_messages (sender_id);
create index if not exists spike_room_message_reactions_user_id_fk_idx on public.spike_room_message_reactions (user_id);
create index if not exists spike_room_message_reports_room_id_fk_idx on public.spike_room_message_reports (room_id);
create index if not exists spike_room_message_reports_reporter_id_fk_idx on public.spike_room_message_reports (reporter_id);
create index if not exists spike_room_message_rewards_comment_message_id_fk_idx on public.spike_room_message_rewards (comment_message_id);
create index if not exists spike_room_reports_reporter_id_fk_idx on public.spike_room_reports (reporter_id);
