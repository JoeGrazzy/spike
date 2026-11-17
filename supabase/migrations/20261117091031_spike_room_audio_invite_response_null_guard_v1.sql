CREATE OR REPLACE FUNCTION public.spike_room_audio_invite_respond(p_invite_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_invite public.spike_room_audio_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR p_invite_id IS NULL OR p_action IS NULL OR p_action NOT IN ('accepted','declined') THEN
    RAISE EXCEPTION 'Invalid invitation response.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_invite FROM public.spike_room_audio_invites WHERE id=p_invite_id AND recipient_id=v_uid FOR UPDATE;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invitation not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_invite.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'status',v_invite.status,'message','This invitation is no longer available.');
  END IF;
  IF v_invite.expires_at<=now()
     OR NOT EXISTS (SELECT 1 FROM private.spike_room_live_audio_sessions s WHERE s.room_id=v_invite.room_id AND s.broadcaster_id=v_invite.broadcaster_id AND s.status='active' AND s.heartbeat_at>=now()-interval '90 seconds')
     OR NOT EXISTS (SELECT 1 FROM public.spike_room_members m WHERE m.room_id=v_invite.room_id AND m.user_id=v_uid AND m.member_state='active') THEN
    UPDATE public.spike_room_audio_invites SET status='expired',responded_at=now() WHERE id=v_invite.id;
    RETURN jsonb_build_object('ok',false,'status','expired','message','This invitation has expired.');
  END IF;
  UPDATE public.spike_room_audio_invites SET status=p_action,responded_at=now() WHERE id=v_invite.id RETURNING * INTO v_invite;
  RETURN jsonb_build_object('ok',true,'status',v_invite.status,'invite_id',v_invite.id,'room_id',v_invite.room_id,
    'broadcaster_id',v_invite.broadcaster_id,'recipient_id',v_invite.recipient_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_room_audio_invite_respond(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_room_audio_invite_respond(uuid,text) TO authenticated;
