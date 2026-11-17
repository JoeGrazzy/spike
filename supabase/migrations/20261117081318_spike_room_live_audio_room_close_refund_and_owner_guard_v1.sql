create or replace function private.spike_room_live_audio_expire_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0; v_original_uid uuid := auth.uid();
begin
  for r in
    select q.id,q.requester_id from private.spike_room_live_audio_requests q
    left join public.spike_rooms room on room.id=q.room_id
    where ((q.status='pending' and q.expires_at<=now())
       or (q.status='approved' and q.approved_start_expires_at<=now())
       or room.id is null or room.status<>'live')
    order by q.created_at for update of q skip locked
  loop
    update private.spike_room_live_audio_requests set status='expired',refunded_at=now() where id=r.id;
    perform set_config('request.jwt.claim.sub',r.requester_id::text,true);
    perform private.spike_apply_coin_delta_with_sources(r.requester_id,100,'refund',
      'SPLR:'||r.id::text||':REFUND','Refund for expired or closed-room SPIKE live-audio request');
    v_count:=v_count+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(v_original_uid::text,''),true);
  return v_count;
end; $$;

create or replace function public.spike_room_live_audio_decide_request(p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_req private.spike_room_live_audio_requests; v_room public.spike_rooms;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_action not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;
  perform private.spike_room_live_audio_expire_requests();
  select r.* into v_req from private.spike_room_live_audio_requests r where r.id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into v_room from public.spike_rooms where id=v_req.room_id;
  if v_room.host_id<>v_uid and v_room.active_host_id<>v_uid then raise exception 'Only the room owner can decide live-audio requests'; end if;
  if not exists(select 1 from public.spike_room_members m where m.room_id=v_req.room_id and m.user_id=v_uid and m.member_state='active') then raise exception 'The room owner must be an active room member to decide requests'; end if;
  if v_room.status<>'live' then raise exception 'This room is no longer live'; end if;
  if v_req.status<>'pending' or v_req.expires_at<=now() then raise exception 'This request has expired or was already handled'; end if;
  if p_action='approve' then
    if exists(select 1 from private.spike_room_live_audio_sessions s where s.room_id=v_req.room_id and s.status='active') then raise exception 'A live broadcast is already active in this room'; end if;
    update private.spike_room_live_audio_requests set status='approved',decided_at=now(),decided_by=v_uid,approved_start_expires_at=now()+interval '5 minutes' where id=p_request_id;
    return jsonb_build_object('ok',true,'status','approved','start_expires_at',now()+interval '5 minutes');
  end if;
  update private.spike_room_live_audio_requests set status='rejected',decided_at=now(),decided_by=v_uid,refunded_at=now() where id=p_request_id;
  perform set_config('request.jwt.claim.sub',v_req.requester_id::text,true);
  perform private.spike_apply_coin_delta_with_sources(v_req.requester_id,100,'refund','SPLR:'||v_req.id::text||':REFUND','Refund for rejected SPIKE room live-audio request');
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  return jsonb_build_object('ok',true,'status','rejected','refunded',100);
end; $$;
