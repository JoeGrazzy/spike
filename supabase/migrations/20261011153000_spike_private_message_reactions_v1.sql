-- SPIKE direct-message reactions. Users may react only to messages in conversations
-- where they are sender or recipient; each user has one reaction per message.
create table if not exists public.private_message_reactions (
  message_id uuid not null references public.private_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('❤️')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.private_message_reactions enable row level security;
drop policy if exists "DM participants can read reactions" on public.private_message_reactions;
create policy "DM participants can read reactions" on public.private_message_reactions
for select to authenticated using (
  exists (select 1 from public.private_messages pm where pm.id = message_id and (pm.sender_id = auth.uid() or pm.recipient_id = auth.uid()))
);
drop policy if exists "Users can add own DM reactions" on public.private_message_reactions;
create policy "Users can add own DM reactions" on public.private_message_reactions
for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.private_messages pm where pm.id = message_id and (pm.sender_id = auth.uid() or pm.recipient_id = auth.uid()))
);
drop policy if exists "Users can remove own DM reactions" on public.private_message_reactions;
create policy "Users can remove own DM reactions" on public.private_message_reactions
for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.private_message_reactions to authenticated;
