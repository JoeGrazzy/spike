-- SPIKE direct-message private Realtime channel authorization for typing and call signaling.
-- Apply to Supabase before enabling the new message.html typing/call controls.
-- Topic format: spike:dm:<participant-uuid>:<participant-uuid> (UUIDs sorted client-side).
-- Only authenticated participants in the topic may read or send Realtime messages.
drop policy if exists "spike dm participants can receive private realtime" on realtime.messages;
create policy "spike dm participants can receive private realtime"
on realtime.messages for select to authenticated
using (
  topic like 'spike:dm:%'
  and ((split_part(topic, ':', 3) = (select auth.uid())::text)
    or (split_part(topic, ':', 4) = (select auth.uid())::text))
);

drop policy if exists "spike dm participants can send private realtime" on realtime.messages;
create policy "spike dm participants can send private realtime"
on realtime.messages for insert to authenticated
with check (
  topic like 'spike:dm:%'
  and ((split_part(topic, ':', 3) = (select auth.uid())::text)
    or (split_part(topic, ':', 4) = (select auth.uid())::text))
);
