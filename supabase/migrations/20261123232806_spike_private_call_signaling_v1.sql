-- Add per-user private call-event topics and active-call signaling authorization.
-- This migration version is already recorded in the connected production project.
begin;

drop policy if exists "SPIKE call owner can receive private event topic" on realtime.messages;
drop policy if exists "SPIKE call owner can send private event topic" on realtime.messages;
create policy "SPIKE call owner can receive private event topic"
  on realtime.messages for select to authenticated
  using (realtime.topic() = 'spike-call-events-' || (select auth.uid())::text);
create policy "SPIKE call owner can send private event topic"
  on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'spike-call-events-' || (select auth.uid())::text);

drop policy if exists "SPIKE call participants can receive private signaling" on realtime.messages;
drop policy if exists "SPIKE call participants can send private signaling" on realtime.messages;
create policy "SPIKE call participants can receive private signaling"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() ~ '^spike-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (select 1 from public.spike_call_sessions cs
      where cs.id=substring(realtime.topic() from 12)::uuid
        and (cs.caller_id=(select auth.uid()) or cs.callee_id=(select auth.uid()))
        and cs.status in ('ringing','accepted'))
  );
create policy "SPIKE call participants can send private signaling"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() ~ '^spike-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (select 1 from public.spike_call_sessions cs
      where cs.id=substring(realtime.topic() from 12)::uuid
        and (cs.caller_id=(select auth.uid()) or cs.callee_id=(select auth.uid()))
        and cs.status in ('ringing','accepted'))
  );

commit;
