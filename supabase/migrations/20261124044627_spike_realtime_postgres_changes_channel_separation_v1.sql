-- Separate Postgres Changes from private Broadcast authorization.
-- Postgres Changes are authorized by table RLS; realtime.messages policies
-- are retained only for the private typing Broadcast topic.
begin;

-- Remove the obsolete per-user private topic policies. The call event feed
-- now uses a public Postgres Changes channel; spike_call_sessions SELECT RLS
-- restricts rows to the caller and callee.
drop policy if exists "SPIKE call owner can receive private event topic" on realtime.messages;
drop policy if exists "SPIKE call owner can send private event topic" on realtime.messages;

-- Move direct-message typing to a dedicated private Broadcast topic. Avoid
-- extension/private predicates here: authorization is scoped by the exact
-- topic namespace and authenticated conversation membership.
drop policy if exists "SPIKE DM members can receive private broadcasts" on realtime.messages;
drop policy if exists "SPIKE DM members can send private broadcasts" on realtime.messages;

drop policy if exists "SPIKE DM typing members can receive" on realtime.messages;
drop policy if exists "SPIKE DM typing members can send" on realtime.messages;

create policy "SPIKE DM typing members can receive"
on realtime.messages for select to authenticated
using (
  realtime.topic() ~ '^spike-dm-typing:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = private.try_uuid(substring(realtime.topic() from 17))
      and cm.user_id = (select auth.uid())
  )
);

create policy "SPIKE DM typing members can send"
on realtime.messages for insert to authenticated
with check (
  realtime.topic() ~ '^spike-dm-typing:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = private.try_uuid(substring(realtime.topic() from 17))
      and cm.user_id = (select auth.uid())
  )
);

commit;
