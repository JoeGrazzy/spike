create or replace function private.spike_room_live_audio_expire_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0; v_original_uid uuid := auth.uid();
begin
  for r in
    select q.id,q.requester_id from private.spike_room_live_audio_requests q
    left join public.spike_rooms room on room.id=q.room_id
    where q.status in ('pending','approved')
      and ((q.status='pending' and q.expires_at<=now())
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
