-- Fix CHANNEL_ERROR on site-wide incoming-call subscriptions.
-- Call topics are spike:call:<recipient UUID>; the existing DM policies only
-- authorize spike:dm:* topics and therefore reject the incoming-call channel.
-- Subscribers may only read their own call topic. A sender may broadcast to a
-- recipient only when a direct-message relationship exists between them.

drop policy if exists "spike call recipients can receive private realtime" on realtime.messages;
create policy "spike call recipients can receive private realtime"
on realtime.messages for select to authenticated
using (
  topic like 'spike:call:%'
  and split_part(topic, ':', 3) = (select auth.uid())::text
);

drop policy if exists "spike dm participants can signal private calls" on realtime.messages;
create policy "spike dm participants can signal private calls"
on realtime.messages for insert to authenticated
with check (
  topic like 'spike:call:%'
  and exists (
    select 1
    from public.private_messages pm
    where (
      pm.sender_id = (select auth.uid())
      and pm.recipient_id::text = split_part(topic, ':', 3)
    ) or (
      pm.recipient_id = (select auth.uid())
      and pm.sender_id::text = split_part(topic, ':', 3)
    )
  )
);
