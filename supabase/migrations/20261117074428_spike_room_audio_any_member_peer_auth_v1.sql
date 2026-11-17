BEGIN;

-- Realtime peer topics authorize the active broadcaster (not only the room host)
-- and one other active, verified room member. The audio session table remains private.
CREATE OR REPLACE FUNCTION public.spike_room_audio_peer_authorized(p_room_id uuid,p_other_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_room_id IS NOT NULL
    AND p_other_user IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.spike_room_members a
      JOIN public.spike_room_members b
        ON b.room_id=a.room_id AND b.user_id=p_other_user
      JOIN private.spike_room_live_audio_sessions s
        ON s.room_id=a.room_id
       AND s.status='active'
       AND s.heartbeat_at >= now()-interval '90 seconds'
      WHERE a.room_id=p_room_id
        AND a.user_id=auth.uid()
        AND a.member_state='active'
        AND b.member_state='active'
        AND (a.user_id=s.broadcaster_id OR b.user_id=s.broadcaster_id)
    );
$$;
REVOKE ALL ON FUNCTION public.spike_room_audio_peer_authorized(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_room_audio_peer_authorized(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS spike_rooms_voice_peer_read_v1 ON realtime.messages;
CREATE POLICY spike_rooms_voice_peer_read_v1 ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension='broadcast'
  AND EXISTS (
    SELECT 1
    FROM public.spike_room_members a
    JOIN public.spike_room_members b ON b.room_id=a.room_id AND b.user_id<>a.user_id
    WHERE a.user_id=(SELECT auth.uid())
      AND a.member_state='active'
      AND b.member_state='active'
      AND public.spike_room_user_has_active_verified_subscription(b.user_id)
      AND (SELECT realtime.topic())='spike-room-voice:'||a.room_id::text||':'||
        least(a.user_id::text,b.user_id::text)||':'||greatest(a.user_id::text,b.user_id::text)
      AND public.spike_room_audio_peer_authorized(a.room_id,b.user_id)
  )
);

DROP POLICY IF EXISTS spike_rooms_voice_peer_write_v1 ON realtime.messages;
CREATE POLICY spike_rooms_voice_peer_write_v1 ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension='broadcast'
  AND EXISTS (
    SELECT 1
    FROM public.spike_room_members a
    JOIN public.spike_room_members b ON b.room_id=a.room_id AND b.user_id<>a.user_id
    WHERE a.user_id=(SELECT auth.uid())
      AND a.member_state='active'
      AND b.member_state='active'
      AND public.spike_room_user_has_active_verified_subscription(b.user_id)
      AND (SELECT realtime.topic())='spike-room-voice:'||a.room_id::text||':'||
        least(a.user_id::text,b.user_id::text)||':'||greatest(a.user_id::text,b.user_id::text)
      AND public.spike_room_audio_peer_authorized(a.room_id,b.user_id)
  )
);

COMMIT;
