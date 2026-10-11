-- SPIKE site-wide incoming-call delivery.
-- A signed-in user receives offers on spike:call:<their UUID> from any page.
-- Call channels are restricted to the intended receiver and users with an existing
-- direct-message relationship. The app must still enforce its call/privacy UX rules.
drop policy if exists "SPIKE call participants can receive targeted call signals" on realtime.messages;
create policy "SPIKE call participants can receive targeted call signals"
on realtime.messages for select to authenticated
using (
  topic like 'spike:call:%'
  and (
    split_part(topic, ':', 3) = (select auth.uid())::text
    or exists (
      select 1 from public.private_messages pm
      where (pm.sender_id = (select auth.uid()) and pm.recipient_id::text = split_part(topic, ':', 3))
         or (pm.recipient_id = (select auth.uid()) and pm.sender_id::text = split_part(topic, ':', 3))
    )
  )
);

drop policy if exists "SPIKE call participants can send targeted call signals" on realtime.messages;
create policy "SPIKE call participants can send targeted call signals"
on realtime.messages for insert to authenticated
with check (
  topic like 'spike:call:%'
  and exists (
    select 1 from public.private_messages pm
    where (pm.sender_id = (select auth.uid()) and pm.recipient_id::text = split_part(topic, ':', 3))
       or (pm.recipient_id = (select auth.uid()) and pm.sender_id::text = split_part(topic, ':', 3))
  )
);
