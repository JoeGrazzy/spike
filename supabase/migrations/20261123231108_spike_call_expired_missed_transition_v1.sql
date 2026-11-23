-- Allow the callee to finalize a ringing call as missed after its invite expiry.
create or replace function public.spike_respond_to_call(p_call_id uuid,p_action text)
returns text language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_uid uuid := (select auth.uid()); v_status text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('accept','reject','missed') then raise exception 'invalid_call_action' using errcode='22023'; end if;
  update public.spike_call_sessions
     set status=case when p_action='accept' then 'accepted' when p_action='missed' then 'missed' else 'rejected' end,
         accepted_at=case when p_action='accept' then now() else accepted_at end,
         ended_at=case when p_action='accept' then null else now() end,
         last_activity_at=now()
   where id=p_call_id and callee_id=v_uid and status='ringing'
     and ((p_action='missed' and expires_at<=now()) or (p_action in ('accept','reject') and expires_at>now()))
   returning status into v_status;
  if v_status is null then raise exception 'call_not_available' using errcode='P0002'; end if;
  return v_status;
end;
$function$;
