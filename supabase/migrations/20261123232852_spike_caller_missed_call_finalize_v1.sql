-- Allow the original caller to finalize an expired unanswered call as missed.
begin;

create or replace function public.spike_mark_call_missed(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  update public.spike_call_sessions
     set status='missed',ended_at=now(),last_activity_at=now()
   where id=p_call_id and caller_id=v_uid and status='ringing' and expires_at<=now();
  return found;
end;
$function$;

revoke all on function public.spike_mark_call_missed(uuid) from public,anon;
grant execute on function public.spike_mark_call_missed(uuid) to authenticated;

commit;
