-- Fix DM typing authorization for existing conversations.
-- Keep the established spike:dm-typing:v1:<sorted-uuid>:<sorted-uuid> topic.
-- Only authenticated participants with an existing DM thread may broadcast;
-- blocks always deny access.
drop policy if exists "spike dm typing v2 participants can receive" on realtime.messages;
create policy "spike dm typing v2 participants can receive"
on realtime.messages for select to authenticated
using (
  auth.uid() is not null
  and split_part(topic, ':', 1) = 'spike'
  and split_part(topic, ':', 2) = 'dm-typing'
  and split_part(topic, ':', 3) = 'v1'
  and split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 4) < split_part(topic, ':', 5)
  and auth.uid()::text in (split_part(topic, ':', 4), split_part(topic, ':', 5))
  and exists (
    select 1 from public.private_messages pm
    where (pm.sender_id = split_part(topic, ':', 4)::uuid and pm.recipient_id = split_part(topic, ':', 5)::uuid)
       or (pm.sender_id = split_part(topic, ':', 5)::uuid and pm.recipient_id = split_part(topic, ':', 4)::uuid)
  )
  and not exists (
    select 1 from public.private_message_blocks b
    where (b.blocker_id = split_part(topic, ':', 4)::uuid and b.blocked_id = split_part(topic, ':', 5)::uuid)
       or (b.blocker_id = split_part(topic, ':', 5)::uuid and b.blocked_id = split_part(topic, ':', 4)::uuid)
  )
);
drop policy if exists "spike dm typing v2 participants can send" on realtime.messages;
create policy "spike dm typing v2 participants can send"
on realtime.messages for insert to authenticated
with check (
  auth.uid() is not null
  and split_part(topic, ':', 1) = 'spike'
  and split_part(topic, ':', 2) = 'dm-typing'
  and split_part(topic, ':', 3) = 'v1'
  and split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 4) < split_part(topic, ':', 5)
  and auth.uid()::text in (split_part(topic, ':', 4), split_part(topic, ':', 5))
  and exists (
    select 1 from public.private_messages pm
    where (pm.sender_id = split_part(topic, ':', 4)::uuid and pm.recipient_id = split_part(topic, ':', 5)::uuid)
       or (pm.sender_id = split_part(topic, ':', 5)::uuid and pm.recipient_id = split_part(topic, ':', 4)::uuid)
  )
  and not exists (
    select 1 from public.private_message_blocks b
    where (b.blocker_id = split_part(topic, ':', 4)::uuid and b.blocked_id = split_part(topic, ':', 5)::uuid)
       or (b.blocker_id = split_part(topic, ':', 5)::uuid and b.blocked_id = split_part(topic, ':', 4)::uuid)
  )
);
