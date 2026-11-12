-- Allow viewers to receive only the social-change broadcasts for profiles
-- whose connection lists they are currently authorized to view.
drop policy if exists "spike users can receive social connection broadcasts" on realtime.messages;
create policy "spike users can receive social connection broadcasts"
on realtime.messages for select to authenticated
using (
  auth.uid() is not null
  and topic ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:social$'
  and (
    split_part(topic,':',2) = (select auth.uid())::text
    or (
      public.can_view_spike_friends((select auth.uid()),split_part(topic,':',2)::uuid)
      and not exists (
        select 1 from public.private_message_blocks b
        where (b.blocker_id=(select auth.uid()) and b.blocked_id=split_part(topic,':',2)::uuid)
           or (b.blocker_id=split_part(topic,':',2)::uuid and b.blocked_id=(select auth.uid()))
      )
    )
  )
);
