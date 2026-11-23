-- Reap accepted calls whose authenticated client heartbeat has disappeared.
create or replace function private.spike_expire_call_invites()
returns integer language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare v_missed integer; v_ended integer;
begin
  update public.spike_call_sessions
     set status='missed',ended_at=now(),last_activity_at=now()
   where status='ringing' and expires_at<=now();
  get diagnostics v_missed=row_count;

  update public.spike_call_sessions
     set status='ended',ended_at=now(),last_activity_at=now()
   where status='accepted' and last_activity_at < now()-interval '4 minutes';
  get diagnostics v_ended=row_count;
  return v_missed+v_ended;
end;
$function$;
