-- Ensure both policies accept the same canonical UUID version/variant format.
drop policy if exists "spike pair participants can send private call realtime" on realtime.messages;
create policy "spike pair participants can send private call realtime"
on realtime.messages for insert to authenticated
with check (
  topic like 'spike:call:%'
  and split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select auth.uid())::text in (split_part(topic, ':', 3), split_part(topic, ':', 4))
  and exists (
    select 1 from public.private_messages pm
    where (pm.sender_id::text = split_part(topic, ':', 3) and pm.recipient_id::text = split_part(topic, ':', 4))
       or (pm.sender_id::text = split_part(topic, ':', 4) and pm.recipient_id::text = split_part(topic, ':', 3))
  )
);
