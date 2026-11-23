-- Harden one-to-one call lifecycle against parallel and abandoned calls.
begin;
alter table public.spike_call_sessions
  add column if not exists last_activity_at timestamptz not null default now();

create or replace function public.spike_touch_call(p_call_id uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_uid uuid := (select auth.uid()); v_rows integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  update public.spike_call_sessions set last_activity_at=now()
   where id=p_call_id and v_uid in (caller_id,callee_id) and status in ('ringing','accepted');
  get diagnostics v_rows=row_count;
  return v_rows=1;
end;
$function$;

create or replace function public.spike_create_call(p_conversation_id uuid,p_call_type text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,auth,private
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_kind text;
  v_peer uuid;
  v_count integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_conversation_id is null or p_call_type is null or p_call_type not in ('voice','video') then
    raise exception 'invalid_call_request' using errcode='22023';
  end if;
  select c.kind into v_kind
    from public.conversations c
   where c.id=p_conversation_id
     and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_uid);
  if not found or v_kind <> 'direct' then raise exception 'direct_conversation_required' using errcode='42501'; end if;
  select count(*) into v_count from public.conversation_members cm where cm.conversation_id=p_conversation_id;
  select cm.user_id into v_peer from public.conversation_members cm
   where cm.conversation_id=p_conversation_id and cm.user_id<>v_uid limit 1;
  if v_count<>2 or v_peer is null then raise exception 'one_to_one_conversation_required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and account_status='active')
     or not exists(select 1 from public.profiles where id=v_peer and account_status='active') then
    raise exception 'active_accounts_required' using errcode='42501';
  end if;
  if not coalesce(public.can_message_spike_user(v_uid,v_peer),false) then
    raise exception 'recipient_unavailable_for_calls' using errcode='42501';
  end if;

  -- Lock both participants in a stable order so simultaneous call attempts cannot race.
  perform pg_advisory_xact_lock(hashtextextended(least(v_uid::text,v_peer::text),0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_uid::text,v_peer::text),0));

  update public.spike_call_sessions set status='missed',ended_at=now(),last_activity_at=now()
   where status='ringing' and expires_at<=now()
     and (caller_id in (v_uid,v_peer) or callee_id in (v_uid,v_peer));
  update public.spike_call_sessions set status='ended',ended_at=now(),last_activity_at=now()
   where status='accepted' and last_activity_at < now()-interval '4 minutes'
     and (caller_id in (v_uid,v_peer) or callee_id in (v_uid,v_peer));
  if exists(select 1 from public.spike_call_sessions s where s.status in ('ringing','accepted')
      and (s.caller_id in (v_uid,v_peer) or s.callee_id in (v_uid,v_peer))) then
    raise exception 'participant_already_in_call' using errcode='23505';
  end if;

  insert into public.spike_call_sessions(conversation_id,caller_id,callee_id,call_type)
  values(p_conversation_id,v_uid,v_peer,p_call_type) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'call_already_in_progress' using errcode='23505';
end;
$function$;

revoke all on function public.spike_touch_call(uuid) from public,anon;
grant execute on function public.spike_touch_call(uuid) to authenticated;
commit;
