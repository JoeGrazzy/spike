-- SPIKE call-channel authorization repair v3.
-- The browser subscribes to spike:call:<recipient UUID>.
-- A recipient must always be allowed to read their own topic. Other users may
-- read it only when a direct-message relationship exists; sending is DM-gated.
-- This removes legacy pair-topic and incorrectly-scoped recipient policies that
-- otherwise create confusing policy history across deployments.

DROP POLICY IF EXISTS "spike pair participants can receive private call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike pair participants can send private call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike call recipients can receive private realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm participants can signal private calls" ON realtime.messages;
DROP POLICY IF EXISTS "SPIKE call participants can receive targeted call signals" ON realtime.messages;
DROP POLICY IF EXISTS "SPIKE call participants can send targeted call signals" ON realtime.messages;
DROP POLICY IF EXISTS "spike users can receive recipient call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm participants can send recipient call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm participants can receive recipient call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike call recipient or dm participant can receive" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm participant can send recipient call" ON realtime.messages;

CREATE POLICY "spike call recipient or dm participant can receive"
ON realtime.messages FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND split_part(topic, ':', 1) = 'spike'
  AND split_part(topic, ':', 2) = 'call'
  AND split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (
    split_part(topic, ':', 3) = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.private_messages pm
      WHERE (pm.sender_id::text = (SELECT auth.uid())::text AND pm.recipient_id::text = split_part(topic, ':', 3))
         OR (pm.recipient_id::text = (SELECT auth.uid())::text AND pm.sender_id::text = split_part(topic, ':', 3))
    )
  )
);

CREATE POLICY "spike dm participant can send recipient call"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND split_part(topic, ':', 1) = 'spike'
  AND split_part(topic, ':', 2) = 'call'
  AND split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.private_messages pm
    WHERE (pm.sender_id::text = (SELECT auth.uid())::text AND pm.recipient_id::text = split_part(topic, ':', 3))
       OR (pm.recipient_id::text = (SELECT auth.uid())::text AND pm.sender_id::text = split_part(topic, ':', 3))
  )
);
