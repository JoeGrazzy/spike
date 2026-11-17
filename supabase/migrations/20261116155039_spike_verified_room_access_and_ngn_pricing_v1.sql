begin;

-- Authoritative NGN subscription prices: 500 NGN monthly, 3,000 NGN yearly.
-- amount_minor is stored in kobo. Existing subscription rows are intentionally untouched.
create or replace function private.spike_create_verified_subscription(p_plan text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid:=auth.uid(); v_spid text; v_id uuid; v_ref text; v_amount bigint;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_plan not in ('monthly','yearly') then raise exception 'Choose a valid monthly or yearly plan'; end if;
  select sp_id into v_spid from public.profiles where id=v_uid;
  if nullif(trim(coalesce(v_spid,'')),'') is null then raise exception 'A valid SPIKE SP ID is required before requesting verification'; end if;
  if private.spike_user_is_restricted(v_uid) then raise exception 'Your active SPIKE account restriction prevents a Verified subscription request'; end if;
  if exists(select 1 from private.spike_verified_subscriptions where user_id=v_uid and status in ('pending_payment','payment_reported','awaiting_identity')) then
    raise exception 'You already have an unresolved SPIKE Verified subscription request';
  end if;
  v_amount:=case when p_plan='monthly' then 50000 else 300000 end;
  v_ref:='SPV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into private.spike_verified_identities(user_id,status) values(v_uid,'pending') on conflict(user_id) do nothing;
  insert into private.spike_verified_subscriptions(user_id,reference,plan,amount_minor,currency)
  values(v_uid,v_ref,p_plan,v_amount,'NGN') returning id into v_id;
  insert into public.notifications(user_id,type,data,priority)
  values(v_uid,'verified_subscription_request_created',jsonb_build_object('reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN'),'normal');
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(v_uid,'verified_subscription_request_created',v_uid,'user',jsonb_build_object('subscription_id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount));
  return jsonb_build_object('ok',true,'id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN','status','pending_payment');
end;
$function$;

create or replace function private.spike_require_verified_room_access(p_user_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if p_user_id is null or not private.spike_user_has_active_verified_subscription(p_user_id) then
    raise exception 'An active SPIKE Verified subscription is required to enter or use rooms. Subscribe from Wallet to continue.' using errcode='42501';
  end if;
end;
$function$;
revoke all on function private.spike_require_verified_room_access(uuid) from public,anon,authenticated;

create or replace function public.spike_room_user_has_active_verified_subscription(p_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
  select p_user_id is not null and private.spike_user_has_active_verified_subscription(p_user_id);
$function$;
revoke all on function public.spike_room_user_has_active_verified_subscription(uuid) from public,anon;
grant execute on function public.spike_room_user_has_active_verified_subscription(uuid) to authenticated;

create or replace function public.spike_room_is_active_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private','auth' as $function$
  select auth.uid() is not null
    and private.spike_user_has_active_verified_subscription(auth.uid())
    and exists(select 1 from public.spike_room_members m
      where m.room_id=p_room_id and m.user_id=auth.uid() and m.member_state='active');
$function$;
revoke all on function public.spike_room_is_active_member(uuid) from public,anon;
grant execute on function public.spike_room_is_active_member(uuid) to authenticated;

do $migration$
declare r record; v_new text; v_count integer:=0;
  v_names text[]:=array[
    'spike_room_delete_message','spike_room_edit_message','spike_room_get_reactions',
    'spike_room_moderate_member','spike_room_react_message','spike_room_report_message',
    'spike_room_request_speaker','spike_room_send_invites','spike_room_send_message',
    'spike_room_send_reply','spike_room_toggle_pin','spike_room_transfer_host',
    'spike_room_update_settings','spike_room_update_settings_v2','spike_rooms_create',
    'spike_rooms_join','spike_rooms_start'
  ];
begin
  for r in select p.proname,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname=any(v_names)
  loop
    v_new:=regexp_replace(r.definition,
      '(?is)(begin\s+if\s+v_uid\s+is\s+null\s+then\s+raise\s+exception\s+''Authentication required''[^;]*;\s*end\s+if;)',
      E'\\1\n  perform private.spike_require_verified_room_access(v_uid);',1);
    if v_new=r.definition then raise exception 'Could not safely add Verified room guard to %',r.proname; end if;
    execute v_new;
    v_count:=v_count+1;
  end loop;
  if v_count<>cardinality(v_names) then raise exception 'Expected to guard % room RPCs, but guarded %',cardinality(v_names),v_count; end if;
end;
$migration$;

do $discovery$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.spike_rooms_discover(integer)'::regprocedure) into v_def;
  v_new:=replace(v_def,'m.member_state=''active'')::bigint',
    'm.member_state=''active'' and private.spike_user_has_active_verified_subscription(m.user_id))::bigint');
  if v_new=v_def then raise exception 'Could not safely update room discovery participant counts'; end if;
  execute v_new;
end;
$discovery$;

drop policy if exists spike_rooms_realtime_read_members_v1 on realtime.messages;
create policy spike_rooms_realtime_read_members_v1 on realtime.messages for select to authenticated
using (extension=any(array['broadcast','presence']) and exists(
  select 1 from public.spike_room_members m where m.user_id=(select auth.uid()) and m.member_state='active'
    and (select realtime.topic())='spike-room:'||m.room_id::text and public.spike_room_is_active_member(m.room_id)));

drop policy if exists spike_rooms_realtime_write_members_v1 on realtime.messages;
create policy spike_rooms_realtime_write_members_v1 on realtime.messages for insert to authenticated
with check (extension=any(array['broadcast','presence']) and exists(
  select 1 from public.spike_room_members m where m.user_id=(select auth.uid()) and m.member_state='active'
    and (select realtime.topic())='spike-room:'||m.room_id::text and public.spike_room_is_active_member(m.room_id)));

drop policy if exists spike_rooms_voice_peer_read_v1 on realtime.messages;
create policy spike_rooms_voice_peer_read_v1 on realtime.messages for select to authenticated
using (extension='broadcast' and exists(
  select 1 from public.spike_room_members a join public.spike_room_members b on b.room_id=a.room_id and b.user_id<>a.user_id
  where a.user_id=(select auth.uid()) and a.member_state='active' and b.member_state='active'
    and public.spike_room_is_active_member(a.room_id)
    and public.spike_room_user_has_active_verified_subscription(b.user_id)
    and (select realtime.topic())='spike-room-voice:'||a.room_id::text||':'||least(a.user_id::text,b.user_id::text)||':'||greatest(a.user_id::text,b.user_id::text)
    and exists(select 1 from public.spike_rooms r where r.id=a.room_id and coalesce(r.active_host_id,r.host_id) in (a.user_id,b.user_id))));

drop policy if exists spike_rooms_voice_peer_write_v1 on realtime.messages;
create policy spike_rooms_voice_peer_write_v1 on realtime.messages for insert to authenticated
with check (extension='broadcast' and exists(
  select 1 from public.spike_room_members a join public.spike_room_members b on b.room_id=a.room_id and b.user_id<>a.user_id
  where a.user_id=(select auth.uid()) and a.member_state='active' and b.member_state='active'
    and public.spike_room_is_active_member(a.room_id)
    and public.spike_room_user_has_active_verified_subscription(b.user_id)
    and (select realtime.topic())='spike-room-voice:'||a.room_id::text||':'||least(a.user_id::text,b.user_id::text)||':'||greatest(a.user_id::text,b.user_id::text)
    and exists(select 1 from public.spike_rooms r where r.id=a.room_id and coalesce(r.active_host_id,r.host_id) in (a.user_id,b.user_id))));

commit;
