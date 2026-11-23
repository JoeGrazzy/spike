-- Notify the callee when an unanswered invitation becomes a missed call.
create or replace function private.spike_notify_missed_call()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  if new.status='missed' and old.status is distinct from new.status then
    insert into public.notifications(user_id,actor_id,type,entity_type,entity_id,title,body,is_read)
    select new.callee_id,new.caller_id,'missed_call','call',new.id,
           case when new.call_type='video' then 'Missed video call' else 'Missed voice call' end,
           'You missed a call on SPIKE.',false
    where not exists(
      select 1 from public.notifications n
       where n.user_id=new.callee_id and n.type='missed_call'
         and n.entity_type='call' and n.entity_id=new.id
    );
  end if;
  return new;
end;
$function$;
revoke all on function private.spike_notify_missed_call() from public,anon,authenticated;
drop trigger if exists spike_notify_missed_call on public.spike_call_sessions;
create trigger spike_notify_missed_call
after update of status on public.spike_call_sessions
for each row when (old.status is distinct from new.status)
execute function private.spike_notify_missed_call();
