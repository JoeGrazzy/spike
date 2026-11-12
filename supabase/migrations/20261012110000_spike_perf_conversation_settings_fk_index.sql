-- Performance: index the referencing side of the other_user_id foreign key.
-- This is additive and safe to re-run; it does not alter data or access policies.
create index if not exists private_message_conversation_settings_other_user_id_idx
  on public.private_message_conversation_settings (other_user_id);
