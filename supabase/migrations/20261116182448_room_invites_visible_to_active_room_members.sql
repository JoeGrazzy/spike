-- Allow every active room member to see pending invitees in the shared room directory.
-- Invite management and response permissions remain governed by their existing RPCs.
DROP POLICY IF EXISTS spike_room_invites_read_participants ON public.spike_room_invites;
CREATE POLICY spike_room_invites_read_participants
ON public.spike_room_invites
FOR SELECT
TO authenticated
USING (
  inviter_id = (SELECT auth.uid())
  OR invitee_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.spike_room_members m
    WHERE m.room_id = spike_room_invites.room_id
      AND m.user_id = (SELECT auth.uid())
      AND m.member_state = 'active'
  )
);
