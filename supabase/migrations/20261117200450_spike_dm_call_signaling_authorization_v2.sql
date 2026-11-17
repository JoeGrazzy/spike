-- Harden direct-call private Realtime topics.
-- Calls may be signaled only between users who have a non-deleted DM thread,
-- and either participant's active block prevents signaling.
drop policy if exists "spike call recipient or dm participant can receive" on realtime.messages;
drop policy if exists "spike dm participant can send recipient call" on realtime.messages;

create policy "spike call recipient or dm participant can receive"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and split_part(topic, ':', 1) = 'spike'
  and split_part(topic, ':', 2) = 'call'
  and split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    split_part(topic, ':', 3) = (select auth.uid())::text
    or exists (
      select 1
      from public.private_messages pm
      where (
        (pm.sender_id = (select auth.uid()) and pm.recipient_id::text = split_part(realtime.messages.topic, ':', 3))
        or
        (pm.recipient_id = (select auth.uid()) and pm.sender_id::text = split_part(realtime.messages.topic, ':', 3))
      )
      and pm.deleted_at is null
      and not exists (
        select 1
        from public.private_message_blocks b
        where
          (b.blocker_id = (select auth.uid()) and b.blocked_id = split_part(realtime.messages.topic, ':', 3)::uuid)
          or
          (b.blocked_id = (select auth.uid()) and b.blocker_id = split_part(realtime.messages.topic, ':', 3)::uuid)
      )
    )
  )
);

create policy "spike dm participant can send recipient call"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and split_part(topic, ':', 1) = 'spike'
  and split_part(topic, ':', 2) = 'call'
  and split_part(topic, ':', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.private_messages pm
    where (
      (pm.sender_id = (select auth.uid()) and pm.recipient_id::text = split_part(realtime.messages.topic, ':', 3))
      or
      (pm.recipient_id = (select auth.uid()) and pm.sender_id::text = split_part(realtime.messages.topic, ':', 3))
    )
    and pm.deleted_at is null
    and not exists (
      select 1
      from public.private_message_blocks b
      where
        (b.blocker_id = (select auth.uid()) and b.blocked_id = split_part(realtime.messages.topic, ':', 3)::uuid)
        or
        (b.blocked_id = (select auth.uid()) and b.blocker_id = split_part(realtime.messages.topic, ':', 3)::uuid)
    )
  )
);
