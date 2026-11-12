-- Sitewide incoming calls use one private recipient topic, independent of the page
-- and independent of the receiver having a preloaded peer-channel list.
drop policy if exists "spike users can receive recipient call realtime" on realtime.messages;
create policy "spike users can receive recipient call realtime"
  on realtime.messages for select to authenticated
  using (realtime.topic() = 'spike:call:' || auth.uid()::text);

drop policy if exists "spike dm participants can send recipient call realtime" on realtime.messages;
create policy "spike dm participants can send recipient call realtime"
  on realtime.messages for insert to authenticated
  with check (
    split_part(realtime.topic(), ':', 1) = 'spike'
    and split_part(realtime.topic(), ':', 2) = 'call'
    and split_part(realtime.topic(), ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.private_messages pm
      where (pm.sender_id = auth.uid() and pm.recipient_id = split_part(realtime.topic(), ':', 3)::uuid)
         or (pm.recipient_id = auth.uid() and pm.sender_id = split_part(realtime.topic(), ':', 3)::uuid)
    )
  );
