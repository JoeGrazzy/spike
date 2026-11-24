-- Guard topic UUID parsing against planner reordering across unrelated Realtime topics.
-- A topic such as spike-call-events-<user-id> must never be cast as a call-session UUID.
drop policy if exists "SPIKE DM members can receive private broadcasts" on realtime.messages;
drop policy if exists "SPIKE DM members can send private broadcasts" on realtime.messages;
create policy "SPIKE DM members can receive private broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and private is true
  and realtime.topic() ~ '^spike-dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = private.try_uuid(substring(realtime.topic() from 10))
      and cm.user_id = (select auth.uid())
  )
);
create policy "SPIKE DM members can send private broadcasts"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and private is true
  and realtime.topic() ~ '^spike-dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = private.try_uuid(substring(realtime.topic() from 10))
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists "SPIKE call participants can receive private signaling" on realtime.messages;
drop policy if exists "SPIKE call participants can send private signaling" on realtime.messages;
create policy "SPIKE call participants can receive private signaling"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast' and private is true
  and realtime.topic() ~ '^spike-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1 from public.spike_call_sessions s
    where s.id = private.try_uuid(substring(realtime.topic() from 12))
      and (s.caller_id = (select auth.uid()) or s.callee_id = (select auth.uid()))
      and s.status in ('ringing','accepted')
      and (s.status <> 'ringing' or s.expires_at > now())
      and (s.status <> 'accepted' or s.last_activity_at > now() - interval '4 minutes')
  )
);
create policy "SPIKE call participants can send private signaling"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast' and private is true
  and realtime.topic() ~ '^spike-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1 from public.spike_call_sessions s
    where s.id = private.try_uuid(substring(realtime.topic() from 12))
      and (s.caller_id = (select auth.uid()) or s.callee_id = (select auth.uid()))
      and s.status in ('ringing','accepted')
      and (s.status <> 'ringing' or s.expires_at > now())
      and (s.status <> 'accepted' or s.last_activity_at > now() - interval '4 minutes')
  )
);
