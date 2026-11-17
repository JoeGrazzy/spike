-- Extend the account timeline with device sessions, room messages, comments, feed events, pulses, media, live and battle activity.
do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 if position('device_session' in d)=0 then
  d:=replace(d,') ev order by at desc',
   'union all select jsonb_build_object(''type'',''device_session'',''title'',''Device session'',''detail'',coalesce(ds.device_label,ds.platform,''Unknown device''),''created_at'',coalesce(ds.last_seen_at,ds.created_at),''revoked_at'',ds.revoked_at),coalesce(ds.last_seen_at,ds.created_at) from public.spike_device_sessions ds where ds.user_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''room_message'',''title'',''Room message sent'',''detail'',m.room_id::text,''created_at'',m.created_at),m.created_at from public.spike_room_messages m where m.sender_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''comment'',''title'',''Comment posted'',''detail'',c.post_id,''created_at'',c.created_at),c.created_at from public.comments c where c.user_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''feed'',''title'',f.event_type,''detail'',f.post_id,''created_at'',f.created_at),f.created_at from public.feed_events f where f.user_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''pulse'',''title'',''Pulse published'',''detail'',p.visibility,''created_at'',p.created_at),p.created_at from public.spike_pulses p where p.author_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''media'',''title'',coalesce(ma.original_name,''Media uploaded''),''detail'',ma.status,''created_at'',ma.created_at),ma.created_at from public.spike_media_assets ma where ma.owner_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''live'',''title'',ls.title,''detail'',ls.status,''created_at'',ls.created_at),ls.created_at from public.spike_live_streams ls where ls.host_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''live_event'',''title'',le.event_type,''detail'',le.value,''created_at'',le.created_at),le.created_at from public.spike_live_events le left join public.spike_live_streams ls on ls.id=le.stream_id where le.actor_id=p_user_id or ls.host_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''battle'',''title'',b.title,''detail'',b.status,''created_at'',b.created_at),b.created_at from public.spike_battles b where b.creator_id=p_user_id or b.opponent_id=p_user_id or b.winner_id=p_user_id '||
   'union all select jsonb_build_object(''type'',''notification'',''title'',n.type,''detail'',n.data->>''title'',''created_at'',n.created_at),n.created_at from public.notifications n where n.user_id=p_user_id '||
   ') ev order by at desc');
 end if;
 execute d;
end;
$block$;
