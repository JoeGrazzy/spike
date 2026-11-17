-- Keep room invitation reads in one policy for a single predictable RLS check.
drop policy if exists spike_room_invites_read_room_moderators on public.spike_room_invites;
drop policy if exists spike_room_invites_read_participants on public.spike_room_invites;
create policy spike_room_invites_read_participants on public.spike_room_invites
for select to authenticated
using (
  inviter_id = (select auth.uid())
  or invitee_id = (select auth.uid())
  or exists (
    select 1 from public.spike_room_members m
    where m.room_id=spike_room_invites.room_id
      and m.user_id=(select auth.uid())
      and m.member_state='active'
      and m.role in ('host','cohost')
  )
);
