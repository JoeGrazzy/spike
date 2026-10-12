-- Align the isolated typing channel with the app's current DM privacy rules.
-- Permits a valid new DM before the first message exists, while respecting blocks/privacy.
DROP POLICY IF EXISTS "spike dm typing v2 participants can receive" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm typing v2 participants can send" ON realtime.messages;

CREATE POLICY "spike dm typing v2 participants can receive"
ON realtime.messages FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND split_part(topic, ':', 1) = 'spike'
  AND split_part(topic, ':', 2) = 'dm-typing'
  AND split_part(topic, ':', 3) = 'v1'
  AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(topic, ':', 4) < split_part(topic, ':', 5)
  AND auth.uid()::text IN (split_part(topic, ':', 4), split_part(topic, ':', 5))
  AND public.can_message_spike_user(split_part(topic, ':', 4)::uuid, split_part(topic, ':', 5)::uuid)
);

CREATE POLICY "spike dm typing v2 participants can send"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND split_part(topic, ':', 1) = 'spike'
  AND split_part(topic, ':', 2) = 'dm-typing'
  AND split_part(topic, ':', 3) = 'v1'
  AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(topic, ':', 4) < split_part(topic, ':', 5)
  AND auth.uid()::text IN (split_part(topic, ':', 4), split_part(topic, ':', 5))
  AND public.can_message_spike_user(split_part(topic, ':', 4)::uuid, split_part(topic, ':', 5)::uuid)
);
