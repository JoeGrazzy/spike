-- Expire unanswered call invitations automatically and trigger missed-call notifications.
create or replace function private.spike_expire_call_invites()
returns integer language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare v_rows integer;
begin
  update public.spike_call_sessions
     set status='missed',ended_at=now(),last_activity_at=now()
   where status='ringing' and expires_at<=now();
  get diagnostics v_rows=row_count;
  return v_rows;
end;
$function$;
revoke all on function private.spike_expire_call_invites() from public,anon,authenticated;
do $schedule$
declare job record;
begin
  for job in select jobid from cron.job where jobname='spike-expire-call-invites' loop
    perform cron.unschedule(job.jobid);
  end loop;
  perform cron.schedule('spike-expire-call-invites','* * * * *','select private.spike_expire_call_invites();');
end;
$schedule$;
