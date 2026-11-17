create or replace function private.spike_room_live_audio_expire_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0; v_original_uid uuid := auth.uid();
begin
  for r in
    select id, requester_id from private.spike_room_live_audio_requests
    where (status = 'pending' and expires_at <= now())
       or (status = 'approved' and approved_start_expires_at <= now())
    order by created_at for update skip locked
  loop
    update private.spike_room_live_audio_requests set status='expired',refunded_at=now() where id=r.id;
    perform set_config('request.jwt.claim.sub',r.requester_id::text,true);
    perform private.spike_apply_coin_delta_with_sources(r.requester_id,100,'refund',
      'SPLR:'||r.id::text||':REFUND','Refund for expired SPIKE room live-audio request');
    v_count:=v_count+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(v_original_uid::text,''),true);
  return v_count;
end; $$;
