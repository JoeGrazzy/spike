-- SPIKE one-to-one voice/video call sessions and private WebRTC signaling authorization.
begin;

create table if not exists public.spike_call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','ended','missed','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '50 seconds'),
  accepted_at timestamptz,
  ended_at timestamptz,
  constraint spike_call_sessions_distinct_users check (caller_id <> callee_id)
);

create index if not exists spike_call_sessions_callee_status_idx
  on public.spike_call_sessions(callee_id,status,created_at desc);
create index if not exists spike_call_sessions_caller_created_idx
  on public.spike_call_sessions(caller_id,created_at desc);
create unique index if not exists spike_call_sessions_one_active_per_conversation_idx
  on public.spike_call_sessions(conversation_id)
  where status in ('ringing','accepted');

alter table public.spike_call_sessions enable row level security;
drop policy if exists "SPIKE call participants can read their calls" on public.spike_call_sessions;
create policy "SPIKE call participants can read their calls"
  on public.spike_call_sessions for select to authenticated
  using ((select auth.uid()) in (caller_id,callee_id));
revoke all on public.spike_call_sessions from anon,authenticated;
grant select on public.spike_call_sessions to authenticated;

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
  select count(*) into v_count
    from public.conversation_members cm where cm.conversation_id=p_conversation_id;
  select cm.user_id into v_peer
    from public.conversation_members cm
   where cm.conversation_id=p_conversation_id and cm.user_id<>v_uid
   limit 1;
  if v_count<>2 or v_peer is null then raise exception 'one_to_one_conversation_required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and account_status='active')
     or not exists(select 1 from public.profiles where id=v_peer and account_status='active') then
    raise exception 'active_accounts_required' using errcode='42501';
  end if;
  if not coalesce(public.can_message_spike_user(v_uid,v_peer),false) then
    raise exception 'recipient_unavailable_for_calls' using errcode='42501';
  end if;
  insert into public.spike_call_sessions(conversation_id,caller_id,callee_id,call_type)
  values(p_conversation_id,v_uid,v_peer,p_call_type) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'call_already_in_progress' using errcode='23505';
end;
$function$;

create or replace function public.spike_respond_to_call(p_call_id uuid,p_action text)
returns text language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_uid uuid := (select auth.uid()); v_status text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('accept','reject') then raise exception 'invalid_call_action' using errcode='22023'; end if;
  update public.spike_call_sessions
     set status=case when p_action='accept' then 'accepted' else 'rejected' end,
         accepted_at=case when p_action='accept' then now() else accepted_at end,
         ended_at=case when p_action='reject' then now() else ended_at end
   where id=p_call_id and callee_id=v_uid and status='ringing' and expires_at>now()
   returning status into v_status;
  if v_status is null then raise exception 'call_not_available' using errcode='P0002'; end if;
  return v_status;
end;
$function$;

create or replace function public.spike_end_call(p_call_id uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_uid uuid := (select auth.uid()); v_rows integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  update public.spike_call_sessions set status='ended',ended_at=now()
   where id=p_call_id and v_uid in (caller_id,callee_id) and status in ('ringing','accepted');
  get diagnostics v_rows=row_count;
  return v_rows=1;
end;
$function$;

revoke all on function public.spike_create_call(uuid,text) from public,anon;
revoke all on function public.spike_respond_to_call(uuid,text) from public,anon;
revoke all on function public.spike_end_call(uuid) from public,anon;
grant execute on function public.spike_create_call(uuid,text) to authenticated;
grant execute on function public.spike_respond_to_call(uuid,text) to authenticated;
grant execute on function public.spike_end_call(uuid) to authenticated;

-- Private Realtime topics expose SDP/ICE only to the two call participants.
drop policy if exists "SPIKE call participants can receive private signaling" on realtime.messages;
drop policy if exists "SPIKE call participants can send private signaling" on realtime.messages;
create policy "SPIKE call participants can receive private signaling"
  on realtime.messages for select to authenticated
  using (
    extension='broadcast' and private is true
    and realtime.topic() ~ '^spike-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists(select 1 from public.spike_call_sessions s
      where s.id=substring(realtime.topic() from 12)::uuid
        and (s.caller_id=(select auth.uid()) or s.callee_id=(select auth.uid())))
  );
create policy "SPIKE call participants can send private signaling"
  on realtime.messages for insert to authenticated
  with check (
    extension='broadcast' and private is true
    and realtime.topic() ~ '^spike-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists(select 1 from public.spike_call_sessions s
      where s.id=substring(realtime.topic() from 12)::uuid
        and (s.caller_id=(select auth.uid()) or s.callee_id=(select auth.uid())))
  );

-- Realtime postgres_changes is needed for incoming-call invitations.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spike_call_sessions') then
    alter publication supabase_realtime add table public.spike_call_sessions;
  end if;
end $$;

commit;
