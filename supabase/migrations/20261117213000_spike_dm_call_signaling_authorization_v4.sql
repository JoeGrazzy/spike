-- Direct-call signaling uses a recipient-only inbox topic. The recipient alone may
-- read that topic; a permitted peer receives INSERT-only access to publish signals.
-- Supabase Realtime allows a client to join a topic with either read OR write access.
-- This avoids exposing a recipient's incoming call events to all their other contacts.
drop policy if exists "spike call recipient or dm participant can receive" on realtime.messages;
drop policy if exists "spike dm participant can send recipient call" on realtime.messages;
drop policy if exists "spike call recipient can receive own inbox" on realtime.messages;
drop policy if exists "spike eligible dm participant can send call signals" on realtime.messages;

create policy "spike call recipient can receive own inbox"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and topic ~* '^spike:call:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 3) = (select auth.uid())::text
);

create policy "spike eligible dm participant can send call signals"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and topic ~* '^spike:call:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 3) <> (select auth.uid())::text
  and public.can_message_spike_user(
    (select auth.uid()),
    split_part(topic, ':', 3)::uuid
  )
);
