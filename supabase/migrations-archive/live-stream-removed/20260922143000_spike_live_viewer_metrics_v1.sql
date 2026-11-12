-- SPIKE Live: server-owned viewer counters and momentum.
-- The application records join/leave events; this trigger owns aggregate counters.
create or replace function public.spike_live_event_metrics()
returns trigger
language plpgsql
set search_path=public
as $function$
begin
  update public.spike_live_streams s
  set
    chat_count = case when new.event_type='chat' then coalesce(s.chat_count,0)+1 else s.chat_count end,
    spark_count = case when new.event_type='spark' then coalesce(s.spark_count,0)+1 else s.spark_count end,
    poll_count = case when new.event_type='poll_vote' then coalesce(s.poll_count,0)+1 else s.poll_count end,
    share_count = case when new.event_type='share' then coalesce(s.share_count,0)+1 else s.share_count end,
    guest_count = case when new.event_type='guest_join' then coalesce(s.guest_count,0)+1 else s.guest_count end,
    moment_count = case when new.event_type='moment' then coalesce(s.moment_count,0)+1 else s.moment_count end,
    viewer_count = case
      when new.event_type='join' then coalesce(s.viewer_count,0)+1
      when new.event_type='leave' then greatest(0,coalesce(s.viewer_count,0)-1)
      else s.viewer_count end,
    peak_viewers = case
      when new.event_type='join' then greatest(coalesce(s.peak_viewers,0),coalesce(s.viewer_count,0)+1)
      else s.peak_viewers end,
    unique_viewers = case
      when new.event_type='join' and not exists(
        select 1 from public.spike_live_events e
        where e.stream_id=new.stream_id and e.actor_id=new.actor_id
          and e.event_type='join' and e.id<>new.id
      ) then coalesce(s.unique_viewers,0)+1
      else s.unique_viewers end,
    momentum = greatest(0,least(100,coalesce(s.momentum,0)+(case new.event_type
      when 'spark' then 0.8 when 'chat' then 0.25 when 'poll_vote' then 0.45
      when 'share' then 0.6 when 'guest_join' then 0.7 when 'moment' then 1.0
      when 'question' then 0.35 when 'join' then 0.08 when 'leave' then -0.03 else 0 end)))
  where s.id=new.stream_id;
  return new;
end;
$function$;
