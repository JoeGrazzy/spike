-- SPIKE Unified Typing v1
-- Ephemeral private Realtime Broadcast only; no typing rows or message-table writes.
-- Channel topics:
--   spike:typing:dm:<lower-uuid>:<higher-uuid>
--   spike:typing:room:<room-uuid>:<channel-uuid>
-- Existing call, presence, notification and social Realtime policies are untouched.

DROP POLICY IF EXISTS "spike unified typing participants receive" ON realtime.messages;
DROP POLICY IF EXISTS "spike unified typing participants send" ON realtime.messages;

CREATE POLICY "spike unified typing participants receive"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'broadcast'
  AND (
    (
      split_part(topic, ':', 1) = 'spike'
      AND split_part(topic, ':', 2) = 'typing'
      AND split_part(topic, ':', 3) = 'dm'
      AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (SELECT auth.uid())::text IN (split_part(topic, ':', 4), split_part(topic, ':', 5))
      AND (
        can_message_spike_user(
          (SELECT auth.uid()),
          CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
            THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END
        )
        OR can_message_spike_user(
          CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
            THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END,
          (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.private_messages pm
          WHERE (pm.sender_id = (SELECT auth.uid()) AND pm.recipient_id =
            CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
              THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END)
             OR (pm.recipient_id = (SELECT auth.uid()) AND pm.sender_id =
            CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
              THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END)
        )
      )
    )
    OR
    (
      split_part(topic, ':', 1) = 'spike'
      AND split_part(topic, ':', 2) = 'typing'
      AND split_part(topic, ':', 3) = 'room'
      AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.room_channels rc
        WHERE rc.id = split_part(topic, ':', 5)::uuid
          AND rc.room_id = split_part(topic, ':', 4)::uuid
          AND (
            EXISTS (SELECT 1 FROM public.room_members rm
              WHERE rm.room_id = rc.room_id AND rm.user_id = (SELECT auth.uid()) AND rm.active = true)
            OR EXISTS (SELECT 1 FROM public.rooms r
              WHERE r.id = rc.room_id AND r.owner_id = (SELECT auth.uid()))
          )
      )
    )
  )
);

CREATE POLICY "spike unified typing participants send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND (
    (
      split_part(topic, ':', 1) = 'spike'
      AND split_part(topic, ':', 2) = 'typing'
      AND split_part(topic, ':', 3) = 'dm'
      AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (SELECT auth.uid())::text IN (split_part(topic, ':', 4), split_part(topic, ':', 5))
      AND (
        can_message_spike_user(
          (SELECT auth.uid()),
          CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
            THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END
        )
        OR can_message_spike_user(
          CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
            THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END,
          (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.private_messages pm
          WHERE (pm.sender_id = (SELECT auth.uid()) AND pm.recipient_id =
            CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
              THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END)
             OR (pm.recipient_id = (SELECT auth.uid()) AND pm.sender_id =
            CASE WHEN (SELECT auth.uid())::text = split_part(topic, ':', 4)
              THEN split_part(topic, ':', 5)::uuid ELSE split_part(topic, ':', 4)::uuid END)
        )
      )
    )
    OR
    (
      split_part(topic, ':', 1) = 'spike'
      AND split_part(topic, ':', 2) = 'typing'
      AND split_part(topic, ':', 3) = 'room'
      AND split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.room_channels rc
        WHERE rc.id = split_part(topic, ':', 5)::uuid
          AND rc.room_id = split_part(topic, ':', 4)::uuid
          AND (
            EXISTS (SELECT 1 FROM public.room_members rm
              WHERE rm.room_id = rc.room_id AND rm.user_id = (SELECT auth.uid()) AND rm.active = true)
            OR EXISTS (SELECT 1 FROM public.rooms r
              WHERE r.id = rc.room_id AND r.owner_id = (SELECT auth.uid()))
          )
      )
    )
  )
);
