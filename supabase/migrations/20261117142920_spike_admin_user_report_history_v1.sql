-- Extend the owner-only user bundle with reports against hosted rooms and authored room messages.
do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 if position('reports,room_reports' in d)=0 then
  d:=replace(d,
   '  return coalesce(v_result,',
   '  v_result:=jsonb_set(v_result,''{reports,room_reports}'',coalesce((select jsonb_agg(jsonb_build_object(''id'',rr.id,''room_id'',rr.room_id,''reason'',rr.reason,''details'',rr.details,''reporter_id'',rr.reporter_id,''created_at'',rr.created_at) order by rr.created_at desc) from public.spike_room_reports rr join public.spike_rooms room on room.id=rr.room_id where room.host_id=p_user_id),''[]''::jsonb),true);'||chr(10)||
   '  v_result:=jsonb_set(v_result,''{reports,room_message_reports}'',coalesce((select jsonb_agg(jsonb_build_object(''id'',mr.id,''room_id'',mr.room_id,''message_id'',mr.message_id,''reason'',mr.reason,''details'',mr.details,''reporter_id'',mr.reporter_id,''created_at'',mr.created_at) order by mr.created_at desc) from public.spike_room_message_reports mr join public.spike_room_messages msg on msg.id=mr.message_id where msg.sender_id=p_user_id),''[]''::jsonb),true);'||chr(10)||
   '  return coalesce(v_result,');
 end if;
 execute d;
end;
$block$;
