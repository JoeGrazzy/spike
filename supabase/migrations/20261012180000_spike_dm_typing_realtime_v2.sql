-- Isolated authorization for ephemeral typing broadcasts in one-to-one DMs.
-- Topic: spike:dm-typing:v1:<lower UUID>:<higher UUID>
-- Does not grant access to the legacy spike:dm: namespace or message contents.
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
  AND EXISTS (
    SELECT 1 FROM public.private_messages pm
    WHERE (pm.sender_id::text = split_part(realtime.messages.topic, ':', 4) AND pm.recipient_id::text = split_part(realtime.messages.topic, ':', 5))
       OR (pm.sender_id::text = split_part(realtime.messages.topic, ':', 5) AND pm.recipient_id::text = split_part(realtime.messages.topic, ':', 4))
  )
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
  AND EXISTS (
    SELECT 1 FROM public.private_messages pm
    WHERE (pm.sender_id::text = split_part(realtime.messages.topic, ':', 4) AND pm.recipient_id::text = split_part(realtime.messages.topic, ':', 5))
       OR (pm.sender_id::text = split_part(realtime.messages.topic, ':', 5) AND pm.recipient_id::text = split_part(realtime.messages.topic, ':', 4))
  )
);
