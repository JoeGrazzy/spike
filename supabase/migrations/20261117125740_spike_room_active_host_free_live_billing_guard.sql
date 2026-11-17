-- Room's current active host broadcasts free and may start without an approval request.
-- Non-owner members still require a one-session approval and retain 5 SP Coin/minute billing.

CREATE OR REPLACE FUNCTION private.spike_room_live_audio_require_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner_id uuid; v_request private.spike_room_live_audio_requests;
BEGIN
  SELECT coalesce(r.active_host_id,r.host_id) INTO v_owner_id
  FROM public.spike_rooms r WHERE r.id=new.room_id;
  IF v_owner_id = new.broadcaster_id THEN RETURN new; END IF;
  SELECT * INTO v_request FROM private.spike_room_live_audio_requests
  WHERE room_id=new.room_id AND requester_id=new.broadcaster_id
    AND status='approved' AND approved_start_expires_at>now()
  ORDER BY decided_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room owner approval is required before you can go live'; END IF;
  UPDATE private.spike_room_live_audio_requests
  SET status='consumed',consumed_at=now(),session_id=new.id WHERE id=v_request.id;
  RETURN new;
END; $$;

CREATE OR REPLACE FUNCTION public.spike_room_live_audio_start(
  p_room_id uuid,p_request_id uuid,p_listener_capacity integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_room public.spike_rooms;
  v_existing private.spike_room_live_audio_sessions; v_session_id uuid:=gen_random_uuid();
  v_capacity integer; v_charge jsonb; v_is_owner boolean:=false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_room_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Room and request ID are required'; END IF;
  PERFORM private.spike_require_verified_room_access(v_uid);
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your account restriction prevents live audio'; END IF;
  SELECT * INTO v_room FROM public.spike_rooms WHERE id=p_room_id AND status='live' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Live audio is available only in a live room'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members m WHERE m.room_id=p_room_id AND m.user_id=v_uid AND m.member_state='active') THEN
    RAISE EXCEPTION 'Join the room before starting live audio';
  END IF;
  v_is_owner:=(coalesce(v_room.active_host_id,v_room.host_id)=v_uid);
  SELECT * INTO v_existing FROM private.spike_room_live_audio_sessions WHERE broadcaster_id=v_uid AND start_request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'already_processed',true,'session_id',v_existing.id,
    'status',v_existing.status,'listener_capacity',v_existing.requested_listener_capacity,
    'billing_through_minute',v_existing.billing_through_minute,'coin_cost',CASE WHEN v_is_owner THEN 0 ELSE 5 END); END IF;
  v_capacity:=coalesce(p_listener_capacity,greatest(v_room.max_participants-1,1));
  IF v_capacity<1 OR v_capacity>greatest(v_room.max_participants-1,1) THEN
    RAISE EXCEPTION 'Requested listener capacity must be between 1 and the room capacity limit (%)',greatest(v_room.max_participants-1,1);
  END IF;
  IF EXISTS(SELECT 1 FROM private.spike_room_live_audio_sessions s WHERE s.room_id=p_room_id AND s.status='active') THEN
    RAISE EXCEPTION 'A live audio broadcast is already active in this room';
  END IF;
  IF NOT v_is_owner THEN
    v_charge:=private.spike_apply_coin_delta_with_sources(v_uid,-5,'spend','SPLA:'||v_session_id::text||':M:1','First prepaid minute of SPIKE room live audio');
  END IF;
  INSERT INTO private.spike_room_live_audio_sessions(id,room_id,broadcaster_id,start_request_id,requested_listener_capacity,status,started_at,heartbeat_at,billing_through_minute)
  VALUES(v_session_id,p_room_id,v_uid,p_request_id,v_capacity,'active',now(),now(),1);
  RETURN jsonb_build_object('ok',true,'already_processed',false,'session_id',v_session_id,'status','active',
    'coin_cost',CASE WHEN v_is_owner THEN 0 ELSE 5 END,'billing_through_minute',1,'listener_capacity',v_capacity,
    'wallet_balance_after',CASE WHEN v_is_owner THEN NULL ELSE v_charge->'wallet_balance_after' END);
END; $function$;

CREATE OR REPLACE FUNCTION public.spike_room_live_audio_heartbeat(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_session private.spike_room_live_audio_sessions; v_room_owner uuid;
  v_is_owner boolean:=false; v_due_minute integer; v_minute integer; v_charge jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  SELECT * INTO v_session FROM private.spike_room_live_audio_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Live audio session not found'; END IF;
  IF v_session.broadcaster_id<>v_uid THEN RAISE EXCEPTION 'Only the broadcaster can renew this live audio session'; END IF;
  IF v_session.status<>'active' THEN RETURN jsonb_build_object('ok',false,'active',false,'status',v_session.status,'stop_required',true); END IF;
  SELECT coalesce(r.active_host_id,r.host_id) INTO v_room_owner FROM public.spike_rooms r WHERE r.id=v_session.room_id;
  v_is_owner:=(v_room_owner=v_uid);
  IF private.spike_user_is_restricted(v_uid) OR NOT private.spike_user_has_active_verified_room_badge(v_uid) THEN
    UPDATE private.spike_room_live_audio_sessions SET status='expired',ended_at=now(),heartbeat_at=now() WHERE id=p_session_id;
    RETURN jsonb_build_object('ok',false,'active',false,'status','expired','stop_required',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members m WHERE m.room_id=v_session.room_id AND m.user_id=v_uid AND m.member_state='active') THEN
    UPDATE private.spike_room_live_audio_sessions SET status='expired',ended_at=now(),heartbeat_at=now() WHERE id=p_session_id;
    RETURN jsonb_build_object('ok',false,'active',false,'status','expired','stop_required',true);
  END IF;
  IF NOT v_is_owner THEN
    v_due_minute:=greatest(1,floor(extract(epoch from(now()-v_session.started_at))/60)::integer+1);
    IF v_due_minute>v_session.billing_through_minute THEN
      FOR v_minute IN (v_session.billing_through_minute+1)..v_due_minute LOOP
        BEGIN
          v_charge:=private.spike_apply_coin_delta_with_sources(v_uid,-5,'spend','SPLA:'||p_session_id::text||':M:'||v_minute::text,
            'Minute '||v_minute::text||' of SPIKE room live audio');
          UPDATE private.spike_room_live_audio_sessions SET billing_through_minute=v_minute,heartbeat_at=now() WHERE id=p_session_id;
        EXCEPTION WHEN OTHERS THEN
          UPDATE private.spike_room_live_audio_sessions SET status='billing_failed',ended_at=now(),heartbeat_at=now() WHERE id=p_session_id;
          RETURN jsonb_build_object('ok',false,'active',false,'status','billing_failed','stop_required',true,'failed_minute',v_minute,
            'message','Your SP Coin balance could not cover the next minute. Live audio has stopped.');
        END;
      END LOOP;
    END IF;
  ELSE
    v_due_minute:=greatest(1,floor(extract(epoch from(now()-v_session.started_at))/60)::integer+1);
  END IF;
  UPDATE private.spike_room_live_audio_sessions SET heartbeat_at=now() WHERE id=p_session_id;
  RETURN jsonb_build_object('ok',true,'active',true,'status','active',
    'billing_through_minute',CASE WHEN v_is_owner THEN v_session.billing_through_minute ELSE v_due_minute END,
    'next_minute_cost',CASE WHEN v_is_owner THEN 0 ELSE 5 END,'is_owner',v_is_owner);
END; $function$;

CREATE OR REPLACE FUNCTION public.spike_room_live_audio_request(p_room_id uuid,p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_room public.spike_rooms; v_existing private.spike_room_live_audio_requests; v_id uuid:=gen_random_uuid(); v_charge jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_room_id IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Room and request key are required'; END IF;
  PERFORM private.spike_room_live_audio_expire_requests();
  PERFORM private.spike_require_verified_room_access(v_uid);
  IF private.spike_user_is_restricted(v_uid) THEN RAISE EXCEPTION 'Your account restriction prevents live-audio requests'; END IF;
  SELECT * INTO v_room FROM public.spike_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.status<>'live' THEN RAISE EXCEPTION 'Requests are available only in a live room'; END IF;
  IF coalesce(v_room.active_host_id,v_room.host_id)=v_uid THEN RAISE EXCEPTION 'Room owners can go live directly without requesting permission'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members m WHERE m.room_id=p_room_id AND m.user_id=v_uid AND m.member_state='active') THEN
    RAISE EXCEPTION 'Join the room before requesting live audio';
  END IF;
  SELECT * INTO v_existing FROM private.spike_room_live_audio_requests WHERE requester_id=v_uid AND request_key=p_request_key;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'already_processed',true,'request_id',v_existing.id,'status',v_existing.status,'expires_at',v_existing.expires_at); END IF;
  IF EXISTS(SELECT 1 FROM private.spike_room_live_audio_sessions s WHERE s.room_id=p_room_id AND s.status='active') THEN RAISE EXCEPTION 'Live audio is already active in this room'; END IF;
  IF EXISTS(SELECT 1 FROM private.spike_room_live_audio_requests q WHERE q.room_id=p_room_id AND q.requester_id=v_uid AND q.status IN ('pending','approved')) THEN
    RAISE EXCEPTION 'You already have a live-audio request awaiting action';
  END IF;
  v_charge:=private.spike_apply_coin_delta_with_sources(v_uid,-100,'spend','SPLR:'||v_id::text||':FEE','SPIKE room live-audio request fee');
  INSERT INTO private.spike_room_live_audio_requests(id,room_id,requester_id,request_key) VALUES(v_id,p_room_id,v_uid,p_request_key);
  RETURN jsonb_build_object('ok',true,'request_id',v_id,'status','pending','fee_coins',100,'expires_at',now()+interval '5 minutes','wallet_balance_after',v_charge->'wallet_balance_after');
END; $$;

CREATE OR REPLACE FUNCTION public.spike_room_live_audio_request_state(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_owner boolean; v_requests jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members m WHERE m.room_id=p_room_id AND m.user_id=v_uid AND m.member_state='active') THEN
    RAISE EXCEPTION 'Active room membership is required';
  END IF;
  PERFORM private.spike_room_live_audio_expire_requests();
  SELECT EXISTS(SELECT 1 FROM public.spike_rooms r WHERE r.id=p_room_id AND coalesce(r.active_host_id,r.host_id)=v_uid) INTO v_owner;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'requester_id',q.requester_id,
    'requester_name',coalesce(p.display_name,p.full_name,p.username,'SPIKE member'),'requester_username',p.username,
    'requester_avatar_url',p.avatar_url,'status',q.status,'created_at',q.created_at,
    'expires_at',CASE WHEN q.status='approved' THEN q.approved_start_expires_at ELSE q.expires_at END,'fee_coins',q.fee_coins) ORDER BY q.created_at),'[]'::jsonb)
  INTO v_requests FROM private.spike_room_live_audio_requests q LEFT JOIN public.profiles p ON p.id=q.requester_id
  WHERE q.room_id=p_room_id AND ((v_owner AND q.status IN ('pending','approved')) OR
    (NOT v_owner AND q.requester_id=v_uid AND q.status IN ('pending','approved','rejected','expired','consumed','completed') AND q.created_at>now()-interval '1 day'));
  RETURN jsonb_build_object('ok',true,'is_owner',v_owner,'requests',v_requests);
END; $$;

CREATE OR REPLACE FUNCTION public.spike_room_live_audio_decide_request(p_request_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_req private.spike_room_live_audio_requests; v_room public.spike_rooms;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
  IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
  PERFORM private.spike_room_live_audio_expire_requests();
  SELECT r.* INTO v_req FROM private.spike_room_live_audio_requests r WHERE r.id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO v_room FROM public.spike_rooms WHERE id=v_req.room_id;
  IF coalesce(v_room.active_host_id,v_room.host_id)<>v_uid THEN RAISE EXCEPTION 'Only the active room owner can decide live-audio requests'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.spike_room_members m WHERE m.room_id=v_req.room_id AND m.user_id=v_uid AND m.member_state='active') THEN
    RAISE EXCEPTION 'The room owner must be an active room member to decide requests';
  END IF;
  IF v_req.status<>'pending' OR v_req.expires_at<=now() THEN RAISE EXCEPTION 'This request has expired or was already handled'; END IF;
  IF p_action='approve' THEN
    IF EXISTS(SELECT 1 FROM private.spike_room_live_audio_sessions s WHERE s.room_id=v_req.room_id AND s.status='active') THEN
      RAISE EXCEPTION 'A live broadcast is already active in this room';
    END IF;
    UPDATE private.spike_room_live_audio_requests SET status='approved',decided_at=now(),decided_by=v_uid,approved_start_expires_at=now()+interval '5 minutes' WHERE id=p_request_id;
    RETURN jsonb_build_object('ok',true,'status','approved','start_expires_at',now()+interval '5 minutes');
  END IF;
  UPDATE private.spike_room_live_audio_requests SET status='rejected',decided_at=now(),decided_by=v_uid,refunded_at=now() WHERE id=p_request_id;
  PERFORM set_config('request.jwt.claim.sub',v_req.requester_id::text,true);
  PERFORM private.spike_apply_coin_delta_with_sources(v_req.requester_id,100,'refund','SPLR:'||v_req.id::text||':REFUND','Refund for rejected SPIKE room live-audio request');
  PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
  RETURN jsonb_build_object('ok',true,'status','rejected','refunded',100);
END; $$;
