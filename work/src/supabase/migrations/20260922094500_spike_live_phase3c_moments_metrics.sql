create table if not exists public.spike_live_moments (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.spike_live_streams(id) on delete cascade,
  creator_id uuid not null,
  title text check (title is null or char_length(title) between 3 and 120),
  moment_type text not null default 'highlight' check (moment_type in ('highlight','question','spark','poll','guest','chat')),
  playback_seconds integer check (playback_seconds is null or playback_seconds >= 0),
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.spike_live_moments enable row level security;
grant select, insert, update on public.spike_live_moments to authenticated;
create index if not exists idx_live_moments_stream_created on public.spike_live_moments(stream_id, created_at desc);

create policy "moments select live" on public.spike_live_moments
for select to authenticated using (exists (
  select 1 from public.spike_live_streams s where s.id = stream_id and s.status in ('live','ended')
));
create policy "moments insert own live" on public.spike_live_moments
for insert to authenticated with check (
  creator_id = (select auth.uid()) and exists (
    select 1 from public.spike_live_streams s where s.id = stream_id and s.status = 'live'
  )
);
create policy "moments host update" on public.spike_live_moments
for update to authenticated using (exists (
  select 1 from public.spike_live_streams s where s.id = stream_id and s.host_id = (select auth.uid())
)) with check (exists (
  select 1 from public.spike_live_streams s where s.id = stream_id and s.host_id = (select auth.uid())
));

alter publication supabase_realtime add table public.spike_live_moments;

create or replace function public.spike_live_event_metrics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.spike_live_streams s set
    chat_count = case when new.event_type='chat' then coalesce(s.chat_count,0)+1 else s.chat_count end,
    spark_count = case when new.event_type='spark' then coalesce(s.spark_count,0)+1 else s.spark_count end,
    poll_count = case when new.event_type='poll_vote' then coalesce(s.poll_count,0)+1 else s.poll_count end,
    share_count = case when new.event_type='share' then coalesce(s.share_count,0)+1 else s.share_count end,
    guest_count = case when new.event_type='guest_join' then coalesce(s.guest_count,0)+1 else s.guest_count end,
    moment_count = case when new.event_type='moment' then coalesce(s.moment_count,0)+1 else s.moment_count end,
    momentum = greatest(0, least(100, coalesce(s.momentum,0) + case new.event_type
      when 'spark' then 0.8 when 'chat' then 0.25 when 'poll_vote' then 0.45
      when 'share' then 0.6 when 'guest_join' then 0.7 when 'moment' then 1.0
      when 'question' then 0.35 when 'join' then 0.08 else 0 end))
  where s.id = new.stream_id;
  return new;
end;
$$;

drop trigger if exists trg_spike_live_event_metrics on public.spike_live_events;
create trigger trg_spike_live_event_metrics
after insert on public.spike_live_events
for each row execute function public.spike_live_event_metrics();
