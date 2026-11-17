BEGIN;

CREATE TABLE IF NOT EXISTS public.spike_room_audio_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  broadcaster_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  responded_at timestamptz,
  CONSTRAINT spike_room_audio_invites_not_self CHECK (broadcaster_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS spike_room_audio_invites_recipient_pending_idx
  ON public.spike_room_audio_invites (recipient_id, room_id, expires_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS spike_room_audio_invites_broadcaster_recent_idx
  ON public.spike_room_audio_invites (broadcaster_id, room_id, created_at DESC);

ALTER TABLE public.spike_room_audio_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spike_room_audio_invites FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.spike_room_audio_invites TO authenticated;
DROP POLICY IF EXISTS spike_room_audio_invites_participant_read_v1 ON public.spike_room_audio_invites;
CREATE POLICY spike_room_audio_invites_participant_read_v1
  ON public.spike_room_audio_invites FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (broadcaster_id, recipient_id));

CREATE OR REPLACE FUNCTION public.spike_room_audio_invite_candidates(p_room_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.spike_room_user_has_active_verified_subscription(v_uid)
     OR NOT EXISTS (
       SELECT 1 FROM public.spike_room_members m
       WHERE m.room_id = p_room_id AND m.user_id = v_uid AND m.member_state = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM private.spike_room_live_audio_sessions s
       WHERE s.room_id = p_room_id AND s.broadcaster_id = v_uid
         AND s.status = 'active' AND s.heartbeat_at >= now() - interval '90 seconds'
     ) THEN
    RAISE EXCEPTION 'Only the active broadcaster can invite listeners.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id
    FROM public.spike_room_members m
    WHERE m.room_id = p_room_id
      AND m.member_state = 'active'
      AND m.user_id <> v_uid
      AND public.spike_room_user_has_active_verified_subscription(m.user_id)
    ORDER BY m.joined_at ASC
    LIMIT 200;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spike_room_audio_invite_create(p_room_id uuid, p_recipient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.spike_room_audio_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR p_room_id IS NULL OR p_recipient_id IS NULL OR p_recipient_id = v_uid THEN
    RAISE EXCEPTION 'Invalid invitation.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id::text || ':' || p_recipient_id::text, 0));
  IF NOT public.spike_room_user_has_active_verified_subscription(v_uid)
     OR NOT EXISTS (
       SELECT 1 FROM public.spike_room_members m
       WHERE m.room_id = p_room_id AND m.user_id = v_uid AND m.member_state = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM private.spike_room_live_audio_sessions s
       WHERE s.room_id = p_room_id AND s.broadcaster_id = v_uid
         AND s.status = 'active' AND s.heartbeat_at >= now() - interval '90 seconds'
     ) THEN
    RAISE EXCEPTION 'Only the active broadcaster can invite listeners.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.spike_room_user_has_active_verified_subscription(p_recipient_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.spike_room_members m
       WHERE m.room_id = p_room_id AND m.user_id = p_recipient_id AND m.member_state = 'active'
     ) THEN
    RAISE EXCEPTION 'That member is no longer eligible to listen.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.spike_room_audio_invites
     SET status = 'expired', responded_at = now()
   WHERE room_id = p_room_id AND broadcaster_id = v_uid AND recipient_id = p_recipient_id
     AND status = 'pending' AND expires_at <= now();

  SELECT * INTO v_invite
  FROM public.spike_room_audio_invites
  WHERE room_id = p_room_id AND broadcaster_id = v_uid AND recipient_id = p_recipient_id
    AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF v_invite.id IS NULL THEN
    INSERT INTO public.spike_room_audio_invites (room_id, broadcaster_id, recipient_id)
    VALUES (p_room_id, v_uid, p_recipient_id)
    RETURNING * INTO v_invite;
  END IF;

  RETURN jsonb_build_object('ok', true, 'invite_id', v_invite.id, 'status', v_invite.status,
    'room_id', v_invite.room_id, 'broadcaster_id', v_invite.broadcaster_id,
    'recipient_id', v_invite.recipient_id, 'expires_at', v_invite.expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spike_room_audio_invite_respond(p_invite_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.spike_room_audio_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR p_invite_id IS NULL OR p_action IS NULL OR p_action NOT IN ('accepted','declined') THEN
    RAISE EXCEPTION 'Invalid invitation response.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_invite
  FROM public.spike_room_audio_invites
  WHERE id = p_invite_id AND recipient_id = v_uid
  FOR UPDATE;
  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'status', v_invite.status, 'message', 'This invitation is no longer available.');
  END IF;
  IF v_invite.expires_at <= now()
     OR NOT EXISTS (
       SELECT 1 FROM private.spike_room_live_audio_sessions s
       WHERE s.room_id = v_invite.room_id AND s.broadcaster_id = v_invite.broadcaster_id
         AND s.status = 'active' AND s.heartbeat_at >= now() - interval '90 seconds'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.spike_room_members m
       WHERE m.room_id = v_invite.room_id AND m.user_id = v_uid AND m.member_state = 'active'
     ) THEN
    UPDATE public.spike_room_audio_invites SET status = 'expired', responded_at = now() WHERE id = v_invite.id;
    RETURN jsonb_build_object('ok', false, 'status', 'expired', 'message', 'This invitation has expired.');
  END IF;
  UPDATE public.spike_room_audio_invites
     SET status = p_action, responded_at = now()
   WHERE id = v_invite.id
  RETURNING * INTO v_invite;
  RETURN jsonb_build_object('ok', true, 'status', v_invite.status, 'invite_id', v_invite.id,
    'room_id', v_invite.room_id, 'broadcaster_id', v_invite.broadcaster_id,
    'recipient_id', v_invite.recipient_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spike_room_audio_invite_inbox(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'room_id', i.room_id, 'broadcaster_id', i.broadcaster_id,
      'recipient_id', i.recipient_id, 'status', i.status,
      'created_at', i.created_at, 'expires_at', i.expires_at
    ) ORDER BY i.created_at DESC)
    FROM public.spike_room_audio_invites i
    JOIN private.spike_room_live_audio_sessions s
      ON s.room_id = i.room_id AND s.broadcaster_id = i.broadcaster_id
     AND s.status = 'active' AND s.heartbeat_at >= now() - interval '90 seconds'
    WHERE i.room_id = p_room_id AND i.recipient_id = v_uid
      AND i.status = 'pending' AND i.expires_at > now()
      AND EXISTS (SELECT 1 FROM public.spike_room_members m
        WHERE m.room_id = i.room_id AND m.user_id = v_uid AND m.member_state = 'active')
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.spike_room_audio_invite_candidates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spike_room_audio_invite_create(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spike_room_audio_invite_respond(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spike_room_audio_invite_inbox(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_room_audio_invite_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_room_audio_invite_create(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_room_audio_invite_respond(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_room_audio_invite_inbox(uuid) TO authenticated;

DO $publication$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'spike_room_audio_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.spike_room_audio_invites;
  END IF;
END;
$publication$;

COMMIT;
