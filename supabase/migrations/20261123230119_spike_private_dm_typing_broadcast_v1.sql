-- Authorize private direct-message Realtime topics only for conversation members.
-- Typing events are ephemeral broadcasts; message content remains in the messages table.
begin;

drop policy if exists "SPIKE DM members can receive private broadcasts" on realtime.messages;
drop policy if exists "SPIKE DM members can send private broadcasts" on realtime.messages;

create policy "SPIKE DM members can receive private broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() ~ '^spike-dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = substring(realtime.topic() from 10)::uuid
      and cm.user_id = (select auth.uid())
  )
);

create policy "SPIKE DM members can send private broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() ~ '^spike-dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = substring(realtime.topic() from 10)::uuid
      and cm.user_id = (select auth.uid())
  )
);

commit;
