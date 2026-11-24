-- Keep direct authenticated follows writes aligned with the QR-first request state.
-- A member may create only their own outgoing request; acceptance is limited to
-- an incoming legacy/new pending request and is still finalized through RPC in UI.
drop policy if exists follows_insert_self on public.follows;
create policy follows_insert_self
on public.follows
for insert
to authenticated
with check (
  follower_id = (select auth.uid())
  and (
    status in ('requested','pending')
    or (
      status = 'accepted'
      and exists (
        select 1 from public.profiles p
        where p.id = follows.following_id
          and p.is_private = false
      )
    )
  )
);

drop policy if exists follows_accept_target on public.follows;
create policy follows_accept_target
on public.follows
for update
to authenticated
using (
  following_id = (select auth.uid())
  and status in ('requested','pending')
)
with check (
  following_id = (select auth.uid())
  and status = 'accepted'
);
