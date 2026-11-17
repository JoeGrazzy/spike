-- Authorize ephemeral direct-message typing broadcasts only for the two DM participants.
-- Topic shape: spike:typing:dm:<lower UUID>:<higher UUID>.
-- Eligibility uses Spike's canonical DM privacy/block guard.
drop policy if exists "spike dm typing participants can read" on realtime.messages;
drop policy if exists "spike dm typing participants can send" on realtime.messages;

create policy "spike dm typing participants can read"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and split_part(topic, ':', 1) = 'spike'
  and split_part(topic, ':', 2) = 'typing'
  and split_part(topic, ':', 3) = 'dm'
  and split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 4) < split_part(topic, ':', 5)
  and (select auth.uid())::text in (split_part(topic, ':', 4), split_part(topic, ':', 5))
  and case
    when split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_message_spike_user(
      (select auth.uid()),
      case when (select auth.uid())::text = split_part(topic, ':', 4)
        then split_part(topic, ':', 5)::uuid else split_part(topic, ':', 4)::uuid end
    )
    else false
  end
);

create policy "spike dm typing participants can send"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and split_part(topic, ':', 1) = 'spike'
  and split_part(topic, ':', 2) = 'typing'
  and split_part(topic, ':', 3) = 'dm'
  and split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(topic, ':', 4) < split_part(topic, ':', 5)
  and (select auth.uid())::text in (split_part(topic, ':', 4), split_part(topic, ':', 5))
  and case
    when split_part(topic, ':', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and split_part(topic, ':', 5) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.can_message_spike_user(
      (select auth.uid()),
      case when (select auth.uid())::text = split_part(topic, ':', 4)
        then split_part(topic, ':', 5)::uuid else split_part(topic, ':', 4)::uuid end
    )
    else false
  end
);
