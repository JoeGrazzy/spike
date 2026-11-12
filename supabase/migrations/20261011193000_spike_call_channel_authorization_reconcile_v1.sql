-- Reconcile the call-channel policy history with the shipped runtime.
-- Runtime contract: caller publishes to spike:call:<recipient UUID>; each signed-in
-- recipient subscribes only to spike:call:<their own UUID>.
-- Apply after the older pair-topic experiments to prevent schema/runtime drift.

DROP POLICY IF EXISTS "spike pair participants can receive private call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike pair participants can send private call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike call recipients can receive private realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm participants can signal private calls" ON realtime.messages;
DROP POLICY IF EXISTS "SPIKE call participants can receive targeted call signals" ON realtime.messages;
DROP POLICY IF EXISTS "SPIKE call participants can send targeted call signals" ON realtime.messages;
DROP POLICY IF EXISTS "spike users can receive recipient call realtime" ON realtime.messages;
DROP POLICY IF EXISTS "spike dm participants can send recipient call realtime" ON realtime.messages;

CREATE POLICY "spike users can receive recipient call realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() = 'spike:call:' || (SELECT auth.uid())::text);

CREATE POLICY "spike dm participants can send recipient call realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    split_part(realtime.topic(), ':', 1) = 'spike'
    AND split_part(realtime.topic(), ':', 2) = 'call'
    AND split_part(realtime.topic(), ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.private_messages pm
      WHERE (pm.sender_id = (SELECT auth.uid()) AND pm.recipient_id = split_part(realtime.topic(), ':', 3)::uuid)
         OR (pm.recipient_id = (SELECT auth.uid()) AND pm.sender_id = split_part(realtime.topic(), ':', 3)::uuid)
    )
  );
