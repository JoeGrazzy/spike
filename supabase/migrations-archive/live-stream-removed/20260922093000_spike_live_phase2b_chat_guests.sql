-- SPIKE Live Phase 2B: realtime chat + multi-guest transport support
create table if not exists public.spike_live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.spike_live_streams(id) on delete cascade,
  user_id uuid not null,
  message text not null check (char_length(message) between 1 and 500),
  reply_to uuid references public.spike_live_chat_messages(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.spike_live_chat_messages enable row level security;
grant select,insert,delete on public.spike_live_chat_messages to authenticated;

create policy "live chat select" on public.spike_live_chat_messages
for select to authenticated using (
  exists (select 1 from public.spike_live_streams s where s.id = stream_id and s.status = 'live')
);
create policy "live chat insert" on public.spike_live_chat_messages
for insert to authenticated with check (
  user_id = (select auth.uid()) and
  exists (select 1 from public.spike_live_streams s where s.id = stream_id and s.status = 'live')
);
create policy "live chat own delete" on public.spike_live_chat_messages
for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists idx_spike_live_chat_stream_created
  on public.spike_live_chat_messages(stream_id, created_at desc);

alter publication supabase_realtime add table public.spike_live_chat_messages;

-- Guests can see/update only requests involving themselves or their hosted streams.
drop policy if exists "live guest select" on public.spike_live_guests;
create policy "live guest select" on public.spike_live_guests
for select to authenticated using (
  guest_id = (select auth.uid()) or host_id = (select auth.uid())
);
drop policy if exists "live guest update" on public.spike_live_guests;
create policy "live guest update" on public.spike_live_guests
for update to authenticated using (
  guest_id = (select auth.uid()) or host_id = (select auth.uid())
) with check (
  guest_id = (select auth.uid()) or host_id = (select auth.uid())
);
