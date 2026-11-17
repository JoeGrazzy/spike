-- Ensure pending invite visibility compares the invite's room_id to the outer room row.
drop policy if exists spike_rooms_read_visible on public.spike_rooms;
create policy spike_rooms_read_visible on public.spike_rooms
for select to authenticated
using (
  (visibility = 'public' and status in ('live','scheduled'))
  or host_id = (select auth.uid())
  or public.spike_room_is_active_member(public.spike_rooms.id)
  or exists (
    select 1 from public.spike_room_invites i
    where i.room_id = public.spike_rooms.id
      and i.invitee_id = (select auth.uid())
      and i.status = 'pending'
  )
);
