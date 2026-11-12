-- Native social FK indexes for predictable lookup and delete performance.
create index if not exists spike_pulses_circle_idx on public.spike_pulses(circle_id);
create index if not exists spike_topic_followers_user_idx on public.spike_topic_followers(user_id,created_at desc);
create index if not exists spike_topics_created_by_idx on public.spike_topics(created_by,created_at desc);
