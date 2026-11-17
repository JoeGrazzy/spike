-- SPIKE room read-path indexes.
-- Supports the exact member and invitation list filters/order used by room.html.
-- Existing security policies and RPC behaviour are unchanged.

create index if not exists spike_room_members_room_state_joined_idx
  on public.spike_room_members (room_id, member_state, joined_at)
  include (user_id, role, is_muted, speaker_requested);

create index if not exists spike_room_invites_room_status_created_idx
  on public.spike_room_invites (room_id, status, created_at);
