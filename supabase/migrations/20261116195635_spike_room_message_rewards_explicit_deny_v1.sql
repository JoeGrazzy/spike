-- Explicitly deny direct browser access to financial reward records.
-- All reads are exposed only through the room-scoped aggregate RPC.
BEGIN;
DROP POLICY IF EXISTS spike_room_message_rewards_explicit_deny_v1
  ON public.spike_room_message_rewards;
CREATE POLICY spike_room_message_rewards_explicit_deny_v1
  ON public.spike_room_message_rewards
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
COMMIT;
