create index if not exists spike_video_call_signals_sender_idx
  on public.spike_video_call_signals (sender_id);

create index if not exists spike_video_calls_ended_by_idx
  on public.spike_video_calls (ended_by)
  where ended_by is not null;
