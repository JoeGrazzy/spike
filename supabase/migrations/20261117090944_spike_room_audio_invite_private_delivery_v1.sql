BEGIN;

CREATE OR REPLACE FUNCTION private.spike_room_audio_invite_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'id', NEW.id,
        'room_id', NEW.room_id,
        'broadcaster_id', NEW.broadcaster_id,
        'recipient_id', NEW.recipient_id,
        'expires_at', NEW.expires_at
      ),
      'room_audio_invite',
      'spike-room-audio-invites:' || NEW.recipient_id::text,
      true
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'id', NEW.id,
        'room_id', NEW.room_id,
        'broadcaster_id', NEW.broadcaster_id,
        'recipient_id', NEW.recipient_id,
        'status', NEW.status
      ),
      'room_audio_invite_response',
      'spike-room-audio-invites:' || NEW.broadcaster_id::text,
      true
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.spike_room_audio_invite_broadcast() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS spike_room_audio_invite_broadcast_v1 ON public.spike_room_audio_invites;
CREATE TRIGGER spike_room_audio_invite_broadcast_v1
AFTER INSERT OR UPDATE OF status ON public.spike_room_audio_invites
FOR EACH ROW EXECUTE FUNCTION private.spike_room_audio_invite_broadcast();

DROP POLICY IF EXISTS spike_room_audio_invites_private_delivery_read_v1 ON realtime.messages;
CREATE POLICY spike_room_audio_invites_private_delivery_read_v1
ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND (SELECT realtime.topic()) = 'spike-room-audio-invites:' || (SELECT auth.uid())::text
);

COMMIT;
