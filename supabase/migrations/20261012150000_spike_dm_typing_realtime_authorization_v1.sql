-- SPIKE DM typing authorization repair.
-- Typing uses the private topic spike:dm:<participant UUID>:<participant UUID>,
-- with participant UUIDs sorted by the client. Both participants need SELECT
-- and INSERT rights for that exact pair topic. This migration is idempotent.

DROP POLICY IF EXISTS "spike dm participants can receive private realtime" ON realtime.messages;
CREATE POLICY "spike dm participants can receive private realtime"
ON realtime.messages FOR SELECT TO authenticated
USING (
  split_part(topic, ':', 1) = 'spike'
  AND split_part(topic, ':', 2) = 'dm'
  AND split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (split_part(topic, ':', 3) = (SELECT auth.uid())::text
    OR split_part(topic, ':', 4) = (SELECT auth.uid())::text)
);

DROP POLICY IF EXISTS "spike dm participants can send private realtime" ON realtime.messages;
CREATE POLICY "spike dm participants can send private realtime"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  split_part(topic, ':', 1) = 'spike'
  AND split_part(topic, ':', 2) = 'dm'
  AND split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (split_part(topic, ':', 3) = (SELECT auth.uid())::text
    OR split_part(topic, ':', 4) = (SELECT auth.uid())::text)
);
