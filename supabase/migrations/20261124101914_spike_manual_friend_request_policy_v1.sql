-- Manual friend requests only: all relationship creation/acceptance goes through
-- the authenticated RPCs, which atomically create both accepted rows on acceptance.
drop policy if exists follows_insert_self on public.follows;
create policy follows_insert_self
on public.follows
for insert
to authenticated
with check (
  follower_id = (select auth.uid())
  and status = 'pending'
  and following_id <> (select auth.uid())
  and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = follows.following_id)
       or (b.blocker_id = follows.following_id and b.blocked_id = (select auth.uid()))
  )
);

-- Prevent clients from converting a one-way pending row into an accepted
-- relationship. The accept RPC performs the paired write under a single transaction.
drop policy if exists follows_accept_target on public.follows;
