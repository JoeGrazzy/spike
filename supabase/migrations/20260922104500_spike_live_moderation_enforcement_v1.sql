-- Enforce Live moderation server-side for chat, questions and participation events.
drop policy if exists "live chat insert" on public.spike_live_chat_messages;
create policy "live chat insert" on public.spike_live_chat_messages
for insert to authenticated with check (
  user_id=(select auth.uid())
  and exists(select 1 from public.spike_live_streams s where s.id=stream_id and s.status='live')
  and not exists(select 1 from public.spike_live_moderation_actions m where m.stream_id=spike_live_chat_messages.stream_id and m.target_user_id=(select auth.uid()) and m.action in ('mute','block','remove'))
);

drop policy if exists spike_live_events_insert on public.spike_live_events;
create policy spike_live_events_insert on public.spike_live_events
for insert to authenticated with check (
  actor_id=(select auth.uid())
  and not exists(select 1 from public.spike_live_moderation_actions m where m.stream_id=spike_live_events.stream_id and m.target_user_id=(select auth.uid()) and m.action in ('mute','block','remove'))
);

drop policy if exists "questions insert own" on public.spike_live_questions;
create policy "questions insert own" on public.spike_live_questions
for insert to authenticated with check (
  user_id=(select auth.uid())
  and exists(select 1 from public.spike_live_streams s where s.id=stream_id and s.status='live')
  and not exists(select 1 from public.spike_live_moderation_actions m where m.stream_id=spike_live_questions.stream_id and m.target_user_id=(select auth.uid()) and m.action in ('mute','block','remove'))
);
